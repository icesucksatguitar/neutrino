// Electron main-process Built-in VPN / Privacy Tunnel controller.
// Applies real Chromium session proxies, DNS-over-HTTPS (DoH), WebRTC IP leak policy,
// Proxy-Auth handling, OS VPN adapter inspection, Kill Switch gating, and live IP checks.
import { app, session, webContents, WebContents } from 'electron';
import {
  buildElectronProxySpec,
  DEFAULT_VPN_CONFIG,
  detectOsVpnAdapters,
  DOH_PROVIDERS,
  modeRequiresTunnelEndpoint,
  normalizeVpnConfig,
  parseCloudflareTrace,
  probeTcpEndpoint,
  shouldKillSwitchBlockRequest,
  VpnConfig,
  VpnConfigStore,
  VpnConnectionState,
  VpnIpCheckResult,
  VpnStatus,
} from './vpnCore';

export type { VpnConfig, VpnStatus, VpnIpCheckResult, VpnMode, DohProviderId, ProxyProtocol } from './vpnCore';

const TOR_CANDIDATE_PORTS = [9050, 9150];

export class VpnController {
  private readonly store: VpnConfigStore;
  private config: VpnConfig;
  private state: VpnConnectionState = 'disconnected';
  private activeProxyRule: string | null = null;
  private activeDnsUrl: string | null = null;
  private webrtcProtected = false;
  private lastError: string | null = null;
  private connectedSince: number | null = null;
  private ipCheck: VpnIpCheckResult | null = null;
  private killSwitchBlockedCount = 0;
  private resolvedTorPort = 9050;
  private listeners = new Set<(status: VpnStatus) => void>();
  private partitions: readonly string[];

  constructor(filePath: string | null, partitions: readonly string[]) {
    this.store = new VpnConfigStore(filePath);
    const loaded = this.store.load();
    this.config = loaded;
    this.partitions = partitions;
  }

  private getTargetSessions(): Electron.Session[] {
    const out: Electron.Session[] = [session.defaultSession];
    for (const p of this.partitions) {
      try {
        out.push(session.fromPartition(p));
      } catch { }
    }
    return out;
  }

  private emitStatus(): void {
    const snapshot = this.getStatus();
    for (const cb of this.listeners) {
      try {
        cb(snapshot);
      } catch { }
    }
  }

  public onStatusChange(cb: (status: VpnStatus) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  public getStatus(): VpnStatus {
    const adapters = detectOsVpnAdapters();
    return {
      state: this.state,
      config: normalizeVpnConfig(this.config),
      activeProxyRule: this.activeProxyRule,
      activeDnsUrl: this.activeDnsUrl,
      webrtcProtected: this.webrtcProtected,
      killSwitchBlocking:
        this.config.enabled && this.config.killSwitch && this.state !== 'connected',
      killSwitchBlockedCount: this.killSwitchBlockedCount,
      detectedOsVpn: adapters[0] ?? null,
      lastError: this.lastError,
      connectedSince: this.connectedSince,
      ipCheck: this.ipCheck ? { ...this.ipCheck } : null,
    };
  }

  /** Called by onBeforeRequest to block non-local requests when Kill Switch triggers. */
  public shouldBlockForKillSwitch(url: string): boolean {
    const blocked = shouldKillSwitchBlockRequest(
      url,
      this.config,
      this.state === 'connected',
    );
    if (blocked) {
      this.killSwitchBlockedCount += 1;
    }
    return blocked;
  }

  /** Supplies proxy credentials when Electron requests proxy authentication. */
  public handleProxyLogin(
    authInfo: Electron.AuthInfo,
    callback: (username?: string, password?: string) => void,
  ): boolean {
    if (!authInfo?.isProxy || !this.config.enabled || this.config.mode !== 'custom-proxy') {
      return false;
    }
    const { username, password } = this.config.proxy;
    if (username) {
      callback(username, password || '');
      return true;
    }
    return false;
  }

  /** Applies saved settings cleanly once Electron sessions are ready. */
  public async initialize(): Promise<VpnStatus> {
    if (this.config.enabled) {
      return this.applyConfig(this.config);
    }
    await this.applyDisconnectedState();
    return this.getStatus();
  }

  /** Applies the current WebRTC IP handling policy to a newly created or existing WebContents. */
  public applyWebRtcPolicy(wc: WebContents): void {
    if (!wc || wc.isDestroyed()) return;
    const policy =
      this.config.enabled && this.config.webrtcGuard
        ? 'disable_non_proxied_udp'
        : 'default';
    try {
      wc.setWebRTCIPHandlingPolicy(policy);
    } catch { }
  }

  private applyWebRtcPolicyToAll(): void {
    const policy =
      this.config.enabled && this.config.webrtcGuard
        ? 'disable_non_proxied_udp'
        : 'default';
    for (const wc of webContents.getAllWebContents()) {
      if (wc.isDestroyed()) continue;
      try {
        wc.setWebRTCIPHandlingPolicy(policy);
      } catch { }
    }
  }

  private async applyDisconnectedState(): Promise<void> {
    const sessions = this.getTargetSessions();
    await Promise.all(
      sessions.map(async (sess) => {
        try {
          await sess.setProxy({ mode: 'system' });
          await sess.closeAllConnections();
        } catch { }
      }),
    );
    try {
      app.configureHostResolver({
        enableBuiltInResolver: true,
        secureDnsMode: 'off',
        secureDnsServers: [],
      });
    } catch { }
    this.state = 'disconnected';
    this.activeProxyRule = null;
    this.activeDnsUrl = null;
    this.webrtcProtected = false;
    this.connectedSince = null;
    this.applyWebRtcPolicyToAll();
    this.emitStatus();
  }

  /** Updates configuration, persists it, and activates/deactivates tunnel rules across all sessions. */
  public async applyConfig(nextRaw: Partial<VpnConfig> | VpnConfig): Promise<VpnStatus> {
    const merged = normalizeVpnConfig({
      ...this.config,
      ...nextRaw,
      proxy: {
        ...this.config.proxy,
        ...(nextRaw && typeof nextRaw === 'object' && 'proxy' in nextRaw && nextRaw.proxy
          ? nextRaw.proxy
          : {}),
      },
    });
    this.config = this.store.save(merged);
    this.lastError = null;

    if (!this.config.enabled) {
      this.killSwitchBlockedCount = 0;
      await this.applyDisconnectedState();
      return this.getStatus();
    }

    this.state = 'connecting';
    this.emitStatus();

    // Verify endpoint reachability honestly when tunnel mode requires a listening proxy.
    if (this.config.mode === 'tor-local') {
      let foundPort: number | null = null;
      for (const port of TOR_CANDIDATE_PORTS) {
        if (await probeTcpEndpoint('127.0.0.1', port, 1200)) {
          foundPort = port;
          break;
        }
      }
      if (foundPort === null) {
        this.state = 'error';
        this.lastError = 'No local Tor SOCKS5 service detected on 127.0.0.1:9050 or 9150.';
        this.activeProxyRule = null;
        this.connectedSince = null;
        this.emitStatus();
        return this.getStatus();
      }
      this.resolvedTorPort = foundPort;
    } else if (this.config.mode === 'custom-proxy') {
      const reachable = await probeTcpEndpoint(
        this.config.proxy.host,
        this.config.proxy.port,
        1800,
      );
      if (!reachable) {
        this.state = 'error';
        this.lastError = `Tunnel endpoint ${this.config.proxy.host}:${this.config.proxy.port} is unreachable.`;
        this.activeProxyRule = null;
        this.connectedSince = null;
        this.emitStatus();
        return this.getStatus();
      }
    }

    const proxySpec = buildElectronProxySpec(this.config, this.resolvedTorPort);
    const doh = DOH_PROVIDERS[this.config.dohProvider] || DOH_PROVIDERS.cloudflare;
    const sessions = this.getTargetSessions();

    await Promise.all(
      sessions.map(async (sess) => {
        try {
          await sess.setProxy(proxySpec);
          await sess.closeAllConnections();
        } catch { }
      }),
    );

    try {
      app.configureHostResolver({
        enableBuiltInResolver: true,
        secureDnsMode: 'secure',
        secureDnsServers: [doh.serverUrl],
      });
    } catch { }

    this.state = 'connected';
    this.activeProxyRule =
      proxySpec.mode === 'fixed_servers' && proxySpec.proxyRules ? proxySpec.proxyRules : null;
    this.activeDnsUrl = doh.serverUrl;
    this.webrtcProtected = this.config.webrtcGuard;
    this.connectedSince = this.connectedSince ?? Date.now();
    this.lastError = null;
    this.applyWebRtcPolicyToAll();
    this.emitStatus();
    return this.getStatus();
  }

  public async connect(patch?: Partial<VpnConfig>): Promise<VpnStatus> {
    return this.applyConfig({ ...(patch || {}), enabled: true });
  }

  public async disconnect(): Promise<VpnStatus> {
    return this.applyConfig({ enabled: false });
  }

  /** Queries the current public exit IP through Neutrino's primary webview session. */
  public async verifyPublicIp(): Promise<VpnIpCheckResult | { error: string }> {
    const start = Date.now();
    const neutrinoSess = session.fromPartition('persist:neutrino');
    try {
      const resp = await neutrinoSess.fetch('https://1.1.1.1/cdn-cgi/trace', {
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        const text = await resp.text();
        const parsed = parseCloudflareTrace(text);
        if (parsed.ip) {
          const result: VpnIpCheckResult = {
            ip: parsed.ip,
            location: parsed.loc,
            colo: parsed.colo,
            latencyMs: Date.now() - start,
            checkedAt: Date.now(),
            via: this.activeProxyRule
              ? `Proxy (${this.activeProxyRule})`
              : modeRequiresTunnelEndpoint(this.config.mode)
                ? 'Fallback Direct'
                : this.config.enabled
                  ? `${this.config.mode === 'system-vpn' ? 'System VPN' : 'DoH'} (${DOH_PROVIDERS[this.config.dohProvider].label})`
                  : 'Direct',
          };
          this.ipCheck = result;
          this.emitStatus();
          return result;
        }
      }
    } catch { }

    try {
      const resp = await neutrinoSess.fetch('https://api.ipify.org?format=json', {
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { ip?: string };
        if (data?.ip) {
          const result: VpnIpCheckResult = {
            ip: data.ip,
            latencyMs: Date.now() - start,
            checkedAt: Date.now(),
            via: this.activeProxyRule ? `Proxy (${this.activeProxyRule})` : 'Direct / DoH',
          };
          this.ipCheck = result;
          this.emitStatus();
          return result;
        }
      }
    } catch (e: any) {
      return { error: e?.message || 'Unable to reach IP verification service' };
    }
    return { error: 'Unable to determine public IP' };
  }

  /** Attaches Proxy-Auth listener without touching normal page auth prompts. */
  public attachLoginHandler(appInstance: Electron.App): void {
    appInstance.on('login', (event, _wc: WebContents, _details, authInfo, callback) => {
      if (this.handleProxyLogin(authInfo, callback)) {
        event.preventDefault();
      }
    });
  }

  public async cleanupOnQuit(): Promise<void> {
    if (!this.config.enabled) return;
    // Leave stored config enabled if user kept VPN active for next launch,
    // just close active proxy sockets cleanly.
    for (const sess of this.getTargetSessions()) {
      try {
        await sess.closeAllConnections();
      } catch { }
    }
  }
}

export { DEFAULT_VPN_CONFIG, normalizeVpnConfig };