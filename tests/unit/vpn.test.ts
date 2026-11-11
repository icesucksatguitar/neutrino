import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { describe, it, expect, afterEach } from 'vitest';
import {
  DEFAULT_BYPASS_RULES,
  DEFAULT_VPN_CONFIG,
  VpnConfigStore,
  buildElectronProxySpec,
  detectOsVpnAdapters,
  normalizeVpnConfig,
  parseCloudflareTrace,
  probeTcpEndpoint,
  shouldKillSwitchBlockRequest,
} from '../../src/main/vpnCore';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('Built-in VPN core helpers', () => {
  it('validates and clamps VPN configuration safely', () => {
    const normalized = normalizeVpnConfig({
      enabled: 1,
      mode: 'invalid-mode',
      dohProvider: 'unknown',
      webrtcGuard: false,
      killSwitch: true,
      proxy: {
        protocol: 'ftp',
        host: '  socks5://vpn.example.org/path?x=1  ',
        port: 999999,
        username: 'alice',
        password: 'secret',
        bypassRules: '',
      },
    });

    expect(normalized.enabled).toBe(true);
    expect(normalized.mode).toBe(DEFAULT_VPN_CONFIG.mode);
    expect(normalized.dohProvider).toBe(DEFAULT_VPN_CONFIG.dohProvider);
    expect(normalized.webrtcGuard).toBe(false);
    expect(normalized.killSwitch).toBe(true);
    expect(normalized.proxy.protocol).toBe('socks5');
    expect(normalized.proxy.host).toBe('vpn.example.org');
    expect(normalized.proxy.port).toBe(65535);
    expect(normalized.proxy.username).toBe('alice');
    expect(normalized.proxy.password).toBe('secret');
    expect(normalized.proxy.bypassRules).toBe(DEFAULT_BYPASS_RULES);
  });

  it('builds exact Electron proxy specs per mode', () => {
    expect(buildElectronProxySpec(normalizeVpnConfig({ enabled: false, mode: 'custom-proxy' }))).toEqual({
      mode: 'system',
    });
    expect(buildElectronProxySpec(normalizeVpnConfig({ enabled: true, mode: 'doh-only' }))).toEqual({
      mode: 'system',
    });
    expect(buildElectronProxySpec(normalizeVpnConfig({ enabled: true, mode: 'system-vpn' }))).toEqual({
      mode: 'system',
    });
    expect(buildElectronProxySpec(normalizeVpnConfig({ enabled: true, mode: 'tor-local' }), 9150)).toEqual({
      mode: 'fixed_servers',
      proxyRules: 'socks5://127.0.0.1:9150',
      proxyBypassRules: DEFAULT_BYPASS_RULES,
    });
    expect(
      buildElectronProxySpec(
        normalizeVpnConfig({
          enabled: true,
          mode: 'custom-proxy',
          proxy: { protocol: 'https', host: 'proxy.example.net', port: 8443, bypassRules: 'localhost' },
        }),
      ),
    ).toEqual({
      mode: 'fixed_servers',
      proxyRules: 'https://proxy.example.net:8443',
      proxyBypassRules: 'localhost',
    });
  });

  it('enforces Kill Switch strictly on non-local outbound URLs while connected fails or drops', () => {
    const activeKillConfig = normalizeVpnConfig({
      enabled: true,
      mode: 'custom-proxy',
      killSwitch: true,
      proxy: { protocol: 'socks5', host: '10.8.0.1', port: 1080 },
    });

    // When disconnected unexpectedly while enabled + killSwitch ON, block clearnet web requests
    expect(shouldKillSwitchBlockRequest('https://example.com/', activeKillConfig, false)).toBe(true);
    expect(shouldKillSwitchBlockRequest('http://news.ycombinator.com/', activeKillConfig, false)).toBe(true);

    // Exempt local, internal, and proxy hosts even during Kill Switch lock
    expect(shouldKillSwitchBlockRequest('file:///index.html', activeKillConfig, false)).toBe(false);
    expect(shouldKillSwitchBlockRequest('devtools://devtools', activeKillConfig, false)).toBe(false);
    expect(shouldKillSwitchBlockRequest('http://127.0.0.1:3000/test', activeKillConfig, false)).toBe(false);
    expect(shouldKillSwitchBlockRequest('https://localhost:5173/', activeKillConfig, false)).toBe(false);
    expect(shouldKillSwitchBlockRequest('http://10.8.0.1:1080/', activeKillConfig, false)).toBe(false);

    // Do not block when tunnel is healthy or when user disabled VPN
    expect(shouldKillSwitchBlockRequest('https://example.com/', activeKillConfig, true)).toBe(false);
    expect(
      shouldKillSwitchBlockRequest('https://example.com/', { ...activeKillConfig, enabled: false }, false),
    ).toBe(false);
  });

  it('detects OS VPN network adapters cleanly', () => {
    const adapters = detectOsVpnAdapters({
      'Wi-Fi': [{ address: '192.168.1.5', netmask: '255.255.255.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal: false, cidr: '192.168.1.5/24' }],
      Loopback: [{ address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal: true, cidr: '127.0.0.1/8' }],
      WireGuardTunnel: [{ address: '10.66.66.2', netmask: '255.255.255.255', family: 'IPv4', mac: '00:00:00:00:00:00', internal: false, cidr: '10.66.66.2/32' }],
      Tailscale: [{ address: '100.64.0.12', netmask: '255.192.0.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal: false, cidr: '100.64.0.12/10' }],
    });
    expect(adapters.map((a) => a.name)).toEqual(['WireGuardTunnel', 'Tailscale']);
    expect(adapters[0].addresses).toEqual(['10.66.66.2']);
  });

  it('parses Cloudflare trace output accurately', () => {
    expect(parseCloudflareTrace('fl=12f\nip=203.0.113.42\nloc=US\ncolo=SJC\n')).toEqual({
      ip: '203.0.113.42',
      loc: 'US',
      colo: 'SJC',
    });
  });

  it('probes live TCP endpoints accurately and persists config atomically', async () => {
    const server = net.createServer((sock) => sock.end());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address() as net.AddressInfo;

    expect(await probeTcpEndpoint('127.0.0.1', addr.port, 1000)).toBe(true);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(await probeTcpEndpoint('127.0.0.1', addr.port, 500)).toBe(false);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neutrino-vpn-test-'));
    tempDirs.push(dir);
    const store = new VpnConfigStore(path.join(dir, 'vpn-config.json'));
    store.save(
      normalizeVpnConfig({
        enabled: true,
        mode: 'custom-proxy',
        dohProvider: 'mullvad',
        killSwitch: true,
        proxy: { protocol: 'socks5', host: '127.0.0.1', port: 10808 },
      }),
    );
    const reloaded = store.load();
    expect(reloaded.enabled).toBe(true);
    expect(reloaded.dohProvider).toBe('mullvad');
    expect(reloaded.proxy.port).toBe(10808);
    expect(reloaded.killSwitch).toBe(true);
  });
});

