import React from 'react';
import { ShieldCheck, ShieldAlert, X, EyeOff, Lock, Zap, Database, Globe, RotateCcw } from 'lucide-react';
import { ShieldStats, BlockedTrackerItem } from '../types';

interface ShieldModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats: ShieldStats;
  blockedItems: BlockedTrackerItem[];
  onToggleShields: () => void;
  /** Whether shields are on. Defaults to true until App.tsx passes the saved `adblockEnabled` state. */
  enabled?: boolean;
  activeUrl?: string;
  whitelist?: string[];
  onToggleSiteWhitelist?: (domainOrUrl: string) => void;
  onResetStats?: () => void;
}

function getHttpHost(urlStr?: string): string {
  if (!urlStr) return '';
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.hostname.toLowerCase();
  } catch {
    return '';
  }
}

function matchesWhitelist(host: string, whitelist: string[]): boolean {
  if (!host || whitelist.length === 0) return false;
  return whitelist.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

export const ShieldModal: React.FC<ShieldModalProps> = ({
  isOpen,
  onClose,
  stats,
  blockedItems,
  onToggleShields,
  enabled = true,
  activeUrl,
  whitelist = [],
  onToggleSiteWhitelist,
  onResetStats,
}) => {
  if (!isOpen) return null;

  const siteHost = getHttpHost(activeUrl);
  const siteWhitelisted = matchesWhitelist(siteHost, whitelist);
  const siteProtected = enabled && !siteWhitelisted;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            {siteProtected ? (
              <ShieldCheck size={20} style={{ color: 'var(--shield-green)' }} />
            ) : (
              <ShieldAlert size={20} style={{ color: 'var(--text-muted)' }} />
            )}
            <span>Neutrino Shields</span>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close Shields">
            <X size={16} />
          </button>
        </div>

        {/* Master Toggle Card */}
        <div style={{
          backgroundColor: 'var(--bg-input)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          border: '1px solid var(--border-subtle)',
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '13.5px' }}>
              {enabled ? 'Brave-level Protections Active' : 'Protections paused'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {enabled
                ? 'Blocking cross-site trackers, ads, popups, and fingerprinting'
                : 'Trackers and ads are not being blocked'}
            </div>
          </div>
          <button
            onClick={onToggleShields}
            aria-pressed={enabled}
            aria-label={enabled ? 'Shields on, click to turn off' : 'Shields off, click to turn on'}
            style={{
              backgroundColor: enabled ? 'var(--shield-green)' : 'var(--bg-subtle)',
              color: enabled ? '#ffffff' : 'var(--text-muted)',
              border: enabled ? 'none' : '1px solid var(--border-subtle)',
              padding: '6px 14px',
              borderRadius: '16px',
              fontWeight: 700,
              fontSize: '11.5px',
              cursor: 'pointer',
            }}
          >
            {enabled ? 'ACTIVE' : 'OFF'}
          </button>
        </div>

        {/* Per-site Whitelist Control */}
        {siteHost && onToggleSiteWhitelist && (
          <div style={{
            backgroundColor: 'var(--bg-input)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            border: '1px solid var(--border-subtle)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <Globe size={15} style={{ color: siteWhitelisted ? '#f59e0b' : 'var(--shield-green)', flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '12.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {siteHost}
                </div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                  {!enabled
                    ? 'Paused globally'
                    : siteWhitelisted
                      ? 'Site whitelisted (ads allowed)'
                      : 'Shields enforcing on this site'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onToggleSiteWhitelist(siteHost)}
              aria-pressed={siteWhitelisted}
              style={{
                backgroundColor: siteWhitelisted ? 'rgba(245, 158, 11, 0.16)' : 'var(--bg-subtle)',
                color: siteWhitelisted ? '#f59e0b' : 'var(--text-main)',
                border: `1px solid ${siteWhitelisted ? 'rgba(245, 158, 11, 0.35)' : 'var(--border-subtle)'}`,
                padding: '5px 11px',
                borderRadius: '14px',
                fontWeight: 600,
                fontSize: '11px',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              {siteWhitelisted ? 'Resume Site' : 'Allow on Site'}
            </button>
          </div>
        )}

        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div style={{
            backgroundColor: 'var(--bg-input)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <EyeOff size={16} style={{ color: '#f43f5e' }} />
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>{stats.totalBlocked}</div>
              <div style={{ fontSize: '10.5px', color: 'var(--text-dim)' }}>Ads & Trackers Blocked</div>
            </div>
          </div>

          <div style={{
            backgroundColor: 'var(--bg-input)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <Database size={16} style={{ color: 'var(--shield-green)' }} />
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>{Math.round(stats.dataSavedKb / 1024 * 10) / 10} MB</div>
              <div style={{ fontSize: '10.5px', color: 'var(--text-dim)' }}>Bandwidth Saved</div>
            </div>
          </div>

          <div style={{
            backgroundColor: 'var(--bg-input)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <Lock size={16} style={{ color: 'var(--accent)' }} />
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>Strict</div>
              <div style={{ fontSize: '10.5px', color: 'var(--text-dim)' }}>Fingerprint Noise</div>
            </div>
          </div>

          <div style={{
            backgroundColor: 'var(--bg-input)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <Zap size={16} style={{ color: 'var(--zen-blue)' }} />
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>Active</div>
              <div style={{ fontSize: '10.5px', color: 'var(--text-dim)' }}>Zen Resource Saver</div>
            </div>
          </div>
        </div>

        {/* Whitelisted Domains Pills */}
        {whitelist.length > 0 && onToggleSiteWhitelist && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '10.5px', color: 'var(--text-dim)', fontWeight: 600 }}>Allowed sites:</span>
            {whitelist.map((domain) => (
              <button
                key={domain}
                type="button"
                onClick={() => onToggleSiteWhitelist(domain)}
                title={`Remove ${domain} from whitelist`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '10.5px',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-input)',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                <span>{domain}</span>
                <X size={10} />
              </button>
            ))}
          </div>
        )}

        {/* Live Blocked Log */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>
              Recent Interceptions
            </div>
            {onResetStats && (stats.totalBlocked > 0 || blockedItems.length > 0) && (
              <button
                type="button"
                onClick={onResetStats}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '10.5px',
                  color: 'var(--text-dim)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px 4px',
                }}
                title="Clear blocked counter & log"
              >
                <RotateCcw size={11} />
                <span>Clear</span>
              </button>
            )}
          </div>
          <div style={{
            maxHeight: '140px',
            overflowY: 'auto',
            backgroundColor: 'var(--bg-input)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            padding: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            fontSize: '11px',
          }}>
            {blockedItems.length === 0 ? (
              <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '12px' }}>
                No trackers detected on active page
              </div>
            ) : (
              blockedItems.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '5px 8px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--bg-subtle)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{item.domain}</span>
                  <span style={{
                    fontSize: '9.5px',
                    fontWeight: 700,
                    padding: '1px 5px',
                    borderRadius: '3px',
                    backgroundColor: 'rgba(244,63,94,0.15)',
                    color: '#f43f5e',
                  }}>
                    {item.category || 'Blocked'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

