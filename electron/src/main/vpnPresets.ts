// Pure browser-safe VPN types and DNS-over-HTTPS provider presets (zero Node/Electron imports).

export type VpnMode = 'doh-only' | 'system-vpn' | 'tor-local' | 'custom-proxy';
export type DohProviderId = 'cloudflare' | 'quad9' | 'mullvad' | 'adguard';
export type ProxyProtocol = 'socks5' | 'https' | 'http';
export type VpnConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface DohProviderPreset {
  id: DohProviderId;
  label: string;
  description: string;
  serverUrl: string;
}

export const DOH_PROVIDERS: Record<DohProviderId, DohProviderPreset> = {
  cloudflare: {
    id: 'cloudflare',
    label: 'Cloudflare 1.1.1.1',
    description: 'Fast DNS-over-HTTPS (no IP logging)',
    serverUrl: 'https://cloudflare-dns.com/dns-query',
  },
  quad9: {
    id: 'quad9',
    label: 'Quad9 Security',
    description: 'Blocks malicious domains via DoH',
    serverUrl: 'https://dns.quad9.net/dns-query',
  },
  mullvad: {
    id: 'mullvad',
    label: 'Mullvad Privacy',
    description: 'Strict no-logs encrypted DNS',
    serverUrl: 'https://dns.mullvad.net/dns-query',
  },
  adguard: {
    id: 'adguard',
    label: 'AdGuard DNS',
    description: 'DoH with domain-level ad/tracker filtering',
    serverUrl: 'https://dns.adguard-dns.com/dns-query',
  },
};

