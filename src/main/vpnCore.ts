// Pure Built-in VPN / Privacy Tunnel configuration, proxy formatting, OS adapter scan,
// Kill Switch gating, and TCP endpoint reachability probing (zero Electron imports).
import os from 'os';
import net from 'net';
import { readJsonSafeSync, writeFileAtomicSync } from './atomicFile';
import {
  DOH_PROVIDERS,
  type DohProviderId,
  type DohProviderPreset,
  type ProxyProtocol,
  type VpnConnectionState,
  type VpnMode,
} from './vpnPresets';

export {
  DOH_PROVIDERS,
  type DohProviderId,
  type DohProviderPreset,
  type ProxyProtocol,
  type VpnConnectionState,
  type VpnMode,
};

export interface VpnProxyConfig {
  protocol: ProxyProtocol;
  host: string;
  port: number;
  username?: string;
  password?: string;
  bypassRules: string;
}

export interface VpnConfig {
  enabled: boolean;
  mode: VpnMode;
  dohProvider: DohProviderId;
  webrtcGuard: boolean;
  killSwitch: boolean;
  proxy: VpnProxyConfig;
}

export interface OsVpnAdapter {
  name: string;
  addresses: string[];
}

export interface VpnIpCheckResult {
  ip: string;
  location?: string;
  colo?: string;
  latencyMs: number;
  checkedAt: number;
  via: string;
}

export interface VpnStatus {
  state: VpnConnectionState;
  config: VpnConfig;
  activeProxyRule: string | null;
  activeDnsUrl: string | null;
  webrtcProtected: boolean;
  killSwitchBlocking: boolean;
  killSwitchBlockedCount: number;
  detectedOsVpn: OsVpnAdapter | null;
  lastError: string | null;
  connectedSince: number | null;
  ipCheck: VpnIpCheckResult | null;
}

export const DEFAULT_BYPASS_RULES = 'localhost,127.0.0.1,<local>';

export const DEFAULT_VPN_CONFIG: VpnConfig = {
  enabled: false,
  mode: 'doh-only',
  dohProvider: 'cloudflare',
  webrtcGuard: true,
  killSwitch: false,
  proxy: {
    protocol: 'socks5',
    host: '127.0.0.1',
    port: 1080,
    username: '',
    password: '',
    bypassRules: DEFAULT_BYPASS_RULES,
  },
};

const VALID_MODES = new Set<VpnMode>(['doh-only', 'system-vpn', 'tor-local', 'custom-proxy']);
const VALID_DOH = new Set<DohProviderId>(['cloudflare', 'quad9', 'mullvad', 'adguard']);
const VALID_PROTOCOLS = new Set<ProxyProtocol>(['socks5', 'https', 'http']);

function clampPort(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(65535, Math.round(n)));
}

function sanitizeHost(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value
    .trim()
    .replace(/^[a-z0-9+.-]+:\/\//i, '')
    .split('/')[0]
    .split('?')[0]
    .trim();
  return cleaned || fallback;
}

/** Validates and normalizes persisted or user-supplied VPN settings. */
export function normalizeVpnConfig(raw: unknown): VpnConfig {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const rawProxy =
    src.proxy && typeof src.proxy === 'object' && !Array.isArray(src.proxy)
      ? (src.proxy as Record<string, unknown>)
      : {};

  const mode = typeof src.mode === 'string' && VALID_MODES.has(src.mode as VpnMode)
    ? (src.mode as VpnMode)
    : DEFAULT_VPN_CONFIG.mode;

  const dohProvider =
    typeof src.dohProvider === 'string' && VALID_DOH.has(src.dohProvider as DohProviderId)
      ? (src.dohProvider as DohProviderId)
      : DEFAULT_VPN_CONFIG.dohProvider;

  const protocol =
    typeof rawProxy.protocol === 'string' && VALID_PROTOCOLS.has(rawProxy.protocol as ProxyProtocol)
      ? (rawProxy.protocol as ProxyProtocol)
      : DEFAULT_VPN_CONFIG.proxy.protocol;

  const host = sanitizeHost(rawProxy.host, DEFAULT_VPN_CONFIG.proxy.host);
  const port = clampPort(rawProxy.port, DEFAULT_VPN_CONFIG.proxy.port);
  const bypassRules =
    typeof rawProxy.bypassRules === 'string' && rawProxy.bypassRules.trim()
      ? rawProxy.bypassRules.trim()
      : DEFAULT_BYPASS_RULES;

  return {
    enabled: Boolean(src.enabled),
    mode,
    dohProvider,
    webrtcGuard: src.webrtcGuard === undefined ? DEFAULT_VPN_CONFIG.webrtcGuard : Boolean(src.webrtcGuard),
    killSwitch: Boolean(src.killSwitch),
    proxy: {
      protocol,
      host,
      port,
      username: typeof rawProxy.username === 'string' ? rawProxy.username : '',
      password: typeof rawProxy.password === 'string' ? rawProxy.password : '',
      bypassRules,
    },
  };
}

export interface ElectronProxySpec {
  mode: 'system' | 'fixed_servers' | 'direct';
  proxyRules?: string;
  proxyBypassRules?: string;
}

/** Translates a VpnConfig into an Electron session.setProxy specification. */
export function buildElectronProxySpec(config: VpnConfig, torPort = 9050): ElectronProxySpec {
  if (!config.enabled || config.mode === 'doh-only' || config.mode === 'system-vpn') {
    return { mode: 'system' };
  }
  if (config.mode === 'tor-local') {
    const port = clampPort(torPort, 9050);
    return {
      mode: 'fixed_servers',
      proxyRules: `socks5://127.0.0.1:${port}`,
      proxyBypassRules: DEFAULT_BYPASS_RULES,
    };
  }
  return {
    mode: 'fixed_servers',
    proxyRules: `${config.proxy.protocol}://${config.proxy.host}:${config.proxy.port}`,
    proxyBypassRules: config.proxy.bypassRules || DEFAULT_BYPASS_RULES,
  };
}

/** Whether the selected VPN mode relies on a reachable proxy tunnel endpoint. */
export function modeRequiresTunnelEndpoint(mode: VpnMode): boolean {
  return mode === 'tor-local' || mode === 'custom-proxy';
}

/**
 * Decides whether the Kill Switch must block an outbound HTTP(S) request.
 * Only blocks when VPN is enabled with Kill Switch on and tunnel connectivity is not ready,
 * while always exempting internal URLs, localhost, and the proxy host itself.
 */
export function shouldKillSwitchBlockRequest(
  url: string,
  config: VpnConfig,
  isTunnelReady: boolean,
): boolean {
  if (!config.enabled || !config.killSwitch || isTunnelReady) return false;
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  if (
    lower.startsWith('file://') ||
    lower.startsWith('devtools://') ||
    lower.startsWith('chrome-extension://') ||
    lower.startsWith('data:') ||
    lower.startsWith('blob:') ||
    lower.startsWith('about:') ||
    lower.startsWith('neutrino://')
  ) {
    return false;
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
    if (config.mode === 'custom-proxy' && host === config.proxy.host.toLowerCase()) return false;
  } catch {
    return false;
  }
  return lower.startsWith('http://') || lower.startsWith('https://');
}

const VPN_INTERFACE_RE =
  /(wireguard|\bwg\d*\b|tailscale|warp|cloudflare|proton|nord|mullvad|openvpn|\btun\d*\b|\btap\d*\b|\butun\d*\b|\bppp\d*\b|anyconnect|wintun|zerotier|vpn)/i;

/** Scans network interfaces for active OS VPN / tunnel adapters. */
export function detectOsVpnAdapters(
  interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces(),
): OsVpnAdapter[] {
  const found: OsVpnAdapter[] = [];
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs || !VPN_INTERFACE_RE.test(name)) continue;
    const external = addrs.filter((a) => !a.internal).map((a) => a.address);
    if (external.length > 0) {
      found.push({ name, addresses: external });
    }
  }
  return found;
}

/** Performs a short-timeout TCP connect check to verify a proxy/Tor endpoint is listening. */
export function probeTcpEndpoint(host: string, port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch { }
      resolve(ok);
    };
    const socket = net.createConnection({ host, port });
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

/** Parses Cloudflare `/cdn-cgi/trace` key=value text into IP and edge center code. */
export function parseCloudflareTrace(text: string): { ip?: string; colo?: string; loc?: string } {
  const out: { ip?: string; colo?: string; loc?: string } = {};
  for (const line of text.split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    if (k === 'ip' && v) out.ip = v;
    else if (k === 'colo' && v) out.colo = v;
    else if (k === 'loc' && v) out.loc = v;
  }
  return out;
}

/** Persists VPN configuration atomically outside settings.json so settings invariants remain intact. */
export class VpnConfigStore {
  private readonly filePath: string | null;

  constructor(filePath: string | null) {
    this.filePath = filePath;
  }

  public load(): VpnConfig {
    if (!this.filePath) return normalizeVpnConfig(DEFAULT_VPN_CONFIG);
    const raw = readJsonSafeSync<unknown>(this.filePath, DEFAULT_VPN_CONFIG);
    const payload =
      raw && typeof raw === 'object' && !Array.isArray(raw) && 'config' in raw
        ? (raw as { config: unknown }).config
        : raw;
    return normalizeVpnConfig(payload);
  }

  public save(config: VpnConfig): VpnConfig {
    const normalized = normalizeVpnConfig(config);
    if (!this.filePath) return normalized;
    try {
      writeFileAtomicSync(this.filePath, JSON.stringify({ version: 1, config: normalized }, null, 2));
    } catch (e) {
      console.error('Failed to save VPN config:', e);
    }
    return normalized;
  }
}