import React, { useEffect, useState } from 'react';
import {
  Lock,
  Globe,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Wifi,
  X,
  Server,
} from 'lucide-react';
import { DOH_PROVIDERS } from '../../main/vpnPresets';
import type { DohProviderId, ProxyProtocol, VpnConfig, VpnMode, VpnStatus } from '../types';

interface VpnModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: VpnStatus | null;
  onConnect: (patch?: Partial<VpnConfig>) => Promise<void>;
  onDisconnect: () => Promise<void>;
  onUpdateConfig: (patch: Partial<VpnConfig>) => Promise<void>;
  onCheckIp: () => Promise<void>;
  isCheckingIp: boolean;
  ipCheckError: string | null;
}

const MODE_OPTIONS: Array<{
  id: VpnMode;
  label: string;
  tagline: string;
}> = [
    {
      id: 'doh-only',
      label: 'Encrypted DNS',
      tagline: 'DNS-over-HTTPS + WebRTC leak guard inside Neutrino (built-in, zero setup).',
    },
    {
      id: 'system-vpn',
      label: 'OS VPN Tunnel',
      tagline: 'Routes via your active system VPN adapter / proxy + DoH + WebRTC guard.',
    },
    {
      id: 'tor-local',
      label: 'Tor SOCKS5',
      tagline: 'Routes browser traffic via local Tor daemon on 127.0.0.1:9050 / 9150.',
    },
    {
      id: 'custom-proxy',
      label: 'Custom Tunnel',
      tagline: 'Connects Neutrino sessions through your SOCKS5, HTTPS, or HTTP tunnel endpoint.',
    },
  ];

export const VpnModal: React.FC<VpnModalProps> = ({
  isOpen,
  onClose,
  status,
  onConnect,
  onDisconnect,
  onUpdateConfig,
  onCheckIp,
  isCheckingIp,
  ipCheckError,
}) => {
  const config = status?.config;
  const [proxyProtocol, setProxyProtocol] = useState<ProxyProtocol>('socks5');
  const [proxyHost, setProxyHost] = useState('127.0.0.1');
  const [proxyPort, setProxyPort] = useState('1080');
  const [proxyUser, setProxyUser] = useState('');
  const [proxyPass, setProxyPass] = useState('');
  const [bypassRules, setBypassRules] = useState('localhost,127.0.0.1,<local>');

  useEffect(() => {
    if (config) {
      setProxyProtocol(config.proxy.protocol);
      setProxyHost(config.proxy.host);
      setProxyPort(String(config.proxy.port));
      setProxyUser(config.proxy.username || '');
      setProxyPass(config.proxy.password || '');
      setBypassRules(config.proxy.bypassRules || 'localhost,127.0.0.1,<local>');
    }
  }, [
    isOpen,
    config?.proxy.protocol,
    config?.proxy.host,
    config?.proxy.port,
    config?.proxy.username,
    config?.proxy.password,
    config?.proxy.bypassRules,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !status || !config) return null;

  const isConnected = status.state === 'connected';
  const isConnecting = status.state === 'connecting';
  const isError = status.state === 'error';

  const statusColor = isConnected
    ? 'var(--shield-green, #10b981)'
    : isError
      ? '#ef4444'
      : isConnecting
        ? '#f59e0b'
        : 'var(--text-muted)';

  const statusLabel = isConnected
    ? config.mode === 'custom-proxy' || config.mode === 'tor-local'
      ? `Tunneled (${status.activeProxyRule || config.mode})`
      : config.mode === 'system-vpn' && status.detectedOsVpn
        ? `OS VPN Active (${status.detectedOsVpn.name})`
        : `Encrypted DNS Active`
    : isConnecting
      ? 'Connecting...'
      : isError
        ? 'Connection Failed'
        : 'Disconnected';

  const handleTogglePower = () => {
    if (config.enabled) {
      void onDisconnect();
    } else {
      void onConnect();
    }
  };

  const handleModeSelect = (mode: VpnMode) => {
    void onUpdateConfig({ mode });
  };

  const handleDohSelect = (dohProvider: DohProviderId) => {
    void onUpdateConfig({ dohProvider });
  };

  const handleApplyProxy = (e: React.FormEvent) => {
    e.preventDefault();
    const portNum = Math.max(1, Math.min(65535, parseInt(proxyPort, 10) || 1080));
    void onUpdateConfig({
      enabled: true,
      mode: 'custom-proxy',
      proxy: {
        protocol: proxyProtocol,
        host: proxyHost.trim() || '127.0.0.1',
        port: portNum,
        username: proxyUser,
        password: proxyPass,
        bypassRules: bypassRules.trim() || 'localhost,127.0.0.1,<local>',
      },
    });
  };

  const activeModeMeta = MODE_OPTIONS.find((m) => m.id === config.mode) || MODE_OPTIONS[0];

  return (
    <div
      className="modal-overlay vpn-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Built-in VPN and Privacy Tunnel"
    >
      <div
        className="modal-content-card vpn-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title">
            <Lock size={18} style={{ color: statusColor }} />
            <span>Neutrino Privacy Tunnel (VPN)</span>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close VPN panel">
            <X size={16} />
          </button>
        </div>

        {/* Master Connection Card */}
        <div className="vpn-status-card">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="vpn-status-headline">
              <span className="vpn-status-dot" style={{ backgroundColor: statusColor }} />
              <span style={{ fontWeight: 700, fontSize: '13.5px' }}>{statusLabel}</span>
            </div>
            <div className="vpn-status-sub">
              {status.lastError ? (
                <span style={{ color: '#ef4444' }}>{status.lastError}</span>
              ) : (
                <span>{activeModeMeta.tagline}</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleTogglePower}
            disabled={isConnecting}
            aria-pressed={config.enabled}
            className={`vpn-power-btn ${config.enabled ? 'on' : 'off'}`}
          >
            {config.enabled ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Tunnel Mode Selector */}
        <div className="vpn-section">
          <div className="vpn-section-label">Routing Mode</div>
          <div className="vpn-mode-grid">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`vpn-mode-pill ${config.mode === opt.id ? 'active' : ''}`}
                onClick={() => handleModeSelect(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Proxy Tunnel Configuration */}
        {config.mode === 'custom-proxy' && (
          <form className="vpn-proxy-form" onSubmit={handleApplyProxy}>
            <div className="vpn-section-label">Tunnel Endpoint</div>
            <div className="vpn-proxy-row">
              <select
                value={proxyProtocol}
                onChange={(e) => setProxyProtocol(e.target.value as ProxyProtocol)}
                className="vpn-input vpn-select-proto"
                aria-label="Tunnel protocol"
              >
                <option value="socks5">SOCKS5</option>
                <option value="https">HTTPS</option>
                <option value="http">HTTP</option>
              </select>
              <input
                type="text"
                value={proxyHost}
                onChange={(e) => setProxyHost(e.target.value)}
                placeholder="Host / IP (e.g. 127.0.0.1)"
                className="vpn-input"
                aria-label="Tunnel host"
              />
              <input
                type="number"
                min={1}
                max={65535}
                value={proxyPort}
                onChange={(e) => setProxyPort(e.target.value)}
                placeholder="Port"
                className="vpn-input vpn-input-port"
                aria-label="Tunnel port"
              />
            </div>
            <div className="vpn-proxy-row">
              <input
                type="text"
                value={proxyUser}
                onChange={(e) => setProxyUser(e.target.value)}
                placeholder="Username (optional)"
                className="vpn-input"
                aria-label="Tunnel username"
              />
              <input
                type="password"
                value={proxyPass}
                onChange={(e) => setProxyPass(e.target.value)}
                placeholder="Password (optional)"
                className="vpn-input"
                aria-label="Tunnel password"
              />
            </div>
            <div className="vpn-proxy-row">
              <input
                type="text"
                value={bypassRules}
                onChange={(e) => setBypassRules(e.target.value)}
                placeholder="Bypass: localhost,127.0.0.1,<local>"
                className="vpn-input"
                aria-label="Proxy bypass rules"
              />
              <button type="submit" className="vpn-apply-btn">
                Apply & Connect
              </button>
            </div>
          </form>
        )}

        {/* Encrypted DNS Provider */}
        <div className="vpn-section">
          <div className="vpn-section-label">DNS-over-HTTPS Resolver</div>
          <div className="vpn-doh-grid">
            {(Object.keys(DOH_PROVIDERS) as DohProviderId[]).map((id) => {
              const p = DOH_PROVIDERS[id];
              return (
                <button
                  key={id}
                  type="button"
                  className={`vpn-doh-pill ${config.dohProvider === id ? 'active' : ''}`}
                  onClick={() => handleDohSelect(id)}
                  title={p.description}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Leak Guards */}
        <div className="vpn-toggles-box">
          <div className="vpn-toggle-row">
            <div>
              <div className="vpn-toggle-title">WebRTC IP Leak Guard</div>
              <div className="vpn-toggle-desc">
                Disables non-proxied UDP candidates inside pages & assistants
              </div>
            </div>
            <button
              type="button"
              className={`vpn-mini-switch ${config.webrtcGuard ? 'on' : 'off'}`}
              onClick={() => void onUpdateConfig({ webrtcGuard: !config.webrtcGuard })}
              aria-pressed={config.webrtcGuard}
            >
              {config.webrtcGuard ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="vpn-toggle-row">
            <div>
              <div className="vpn-toggle-title">
                Kill Switch {status.killSwitchBlockedCount > 0 ? `(${status.killSwitchBlockedCount} blocked)` : ''}
              </div>
              <div className="vpn-toggle-desc">
                Blocks clearnet page requests if your active tunnel becomes unreachable
              </div>
            </div>
            <button
              type="button"
              className={`vpn-mini-switch ${config.killSwitch ? 'on' : 'off'}`}
              onClick={() => void onUpdateConfig({ killSwitch: !config.killSwitch })}
              aria-pressed={config.killSwitch}
            >
              {config.killSwitch ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        {/* Live Telemetry: Exit IP & OS VPN Interface */}
        <div className="vpn-telemetry-box">
          <div className="vpn-telemetry-row">
            <span className="vpn-telemetry-key">
              <Server size={13} />
              OS VPN Interface
            </span>
            <span className="vpn-telemetry-val">
              {status.detectedOsVpn
                ? `${status.detectedOsVpn.name} (${status.detectedOsVpn.addresses[0]})`
                : 'None detected'}
            </span>
          </div>

          <div className="vpn-telemetry-row">
            <span className="vpn-telemetry-key">
              <Globe size={13} />
              Observed Exit IP
            </span>
            <span className="vpn-telemetry-val">
              {status.ipCheck ? (
                <>
                  {status.ipCheck.ip}
                  {status.ipCheck.location ? ` · ${status.ipCheck.location}` : ''}
                  {` (${status.ipCheck.latencyMs}ms)`}
                </>
              ) : (
                'Not verified yet'
              )}
            </span>
          </div>

          {ipCheckError && (
            <div className="vpn-telemetry-error">
              <AlertTriangle size={12} />
              <span>{ipCheckError}</span>
            </div>
          )}

          <div className="vpn-footer-actions">
            <div className="vpn-dns-active-note">
              {status.activeDnsUrl ? (
                <>
                  <CheckCircle2 size={12} style={{ color: 'var(--shield-green, #10b981)' }} />
                  <span>DoH: {status.activeDnsUrl}</span>
                </>
              ) : (
                <>
                  <Wifi size={12} />
                  <span>Direct System Network</span>
                </>
              )}
            </div>
            <button
              type="button"
              className="vpn-check-ip-btn"
              onClick={() => void onCheckIp()}
              disabled={isCheckingIp}
            >
              <RefreshCw size={12} className={isCheckingIp ? 'spin-icon' : ''} />
              <span>{isCheckingIp ? 'Checking...' : 'Check Exit IP'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};