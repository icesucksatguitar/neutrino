import React from 'react';
import { X, CheckCircle2, Cpu, Search, Lock, Globe, Shield } from 'lucide-react';
import { BrowserSettings } from '../types/browser';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: BrowserSettings;
  onUpdateSettings: (newSettings: Partial<BrowserSettings>) => void;
  isNativeConnected: boolean;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  isNativeConnected,
}) => {
  if (!isOpen) return null;

  return (
    <div className="shield-modal-backdrop" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <div className="settings-title-group">
            <Shield size={20} className="settings-icon" />
            <div>
              <h3>Neutrino Settings</h3>
              <p>Configure privacy, engine patches, and search behavior</p>
            </div>
          </div>
          <button className="close-modal-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="settings-body">
          {/* Engine Status */}
          <div className="settings-section">
            <h4>
              <Cpu size={15} /> Native Engine Status
            </h4>
            <div className="engine-status-card">
              <div className="status-indicator">
                <span className={`status-dot ${isNativeConnected ? 'online' : 'offline'}`}></span>
                <span className="status-text">
                  {isNativeConnected ? 'Rust Core Connected & Active' : 'Native Host Disconnected'}
                </span>
              </div>
              <div className="engine-meta">
                <span>Binary: <code>neutrino-host.exe</code></span>
                <span>IPC: Mozilla Native Messaging (stdio/JSON)</span>
              </div>
            </div>
          </div>

          {/* Search Engine */}
          <div className="settings-section">
            <h4>
              <Search size={15} /> Default Search Engine
            </h4>
            <div className="setting-row">
              <span>Choose default search provider</span>
              <select
                value={settings.searchEngine}
                onChange={(e) =>
                  onUpdateSettings({
                    searchEngine: e.target.value as BrowserSettings['searchEngine'],
                  })
                }
                className="select-input"
              >
                <option value="DuckDuckGo">DuckDuckGo (Privacy Focused)</option>
                <option value="Brave">Brave Search (Independent Index)</option>
                <option value="Startpage">Startpage (Private Google Results)</option>
                <option value="SearXNG">SearXNG (Decentralized Metasearch)</option>
                <option value="Google">Google (Standard)</option>
              </select>
            </div>
          </div>

          {/* Privacy & Engine Protections */}
          <div className="settings-section">
            <h4>
              <Lock size={15} /> Privacy & Anti-Fingerprinting
            </h4>

            <div className="setting-toggle-row">
              <div className="setting-info">
                <span className="setting-label">Deterministic Canvas Noise</span>
                <span className="setting-sub">
                  Injects subtle, domain-keyed jitter into HTML5 Canvas & WebGL to defeat cross-site tracking
                </span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.strictFingerprinting}
                  onChange={(e) =>
                    onUpdateSettings({ strictFingerprinting: e.target.checked })
                  }
                />
                <span className="slider round"></span>
              </label>
            </div>

            <div className="setting-toggle-row">
              <div className="setting-info">
                <span className="setting-label">Prevent WebRTC IP Leaks</span>
                <span className="setting-sub">
                  Disables ICE candidate enumeration to prevent revealing real local and VPN public IP addresses
                </span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.blockWebRTCLeaks}
                  onChange={(e) =>
                    onUpdateSettings({ blockWebRTCLeaks: e.target.checked })
                  }
                />
                <span className="slider round"></span>
              </label>
            </div>

            <div className="setting-toggle-row">
              <div className="setting-info">
                <span className="setting-label">Strip Tracking Parameters (UTM / Click IDs)</span>
                <span className="setting-sub">
                  Removes <code>utm_*</code>, <code>fbclid</code>, <code>gclid</code>, and marketing query parameters
                </span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.autoCleanUtmParams}
                  onChange={(e) =>
                    onUpdateSettings({ autoCleanUtmParams: e.target.checked })
                  }
                />
                <span className="slider round"></span>
              </label>
            </div>
          </div>

          {/* DNS over HTTPS */}
          <div className="settings-section">
            <h4>
              <Globe size={15} /> Encrypted DNS (DoH)
            </h4>
            <div className="setting-row">
              <span>DoH Provider</span>
              <select
                value={settings.dohProvider}
                onChange={(e) => onUpdateSettings({ dohProvider: e.target.value })}
                className="select-input"
              >
                <option value="https://cloudflare-dns.com/dns-query">Cloudflare (1.1.1.1)</option>
                <option value="https://dns.quad9.net/dns-query">Quad9 (9.9.9.9 - Threat Blocking)</option>
                <option value="https://dns.mullvad.net/dns-query">Mullvad (Ad-blocking DoH)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="settings-footer">
          <button className="primary-btn" onClick={onClose}>
            <CheckCircle2 size={15} /> Save & Apply
          </button>
        </div>
      </div>
    </div>
  );
};

