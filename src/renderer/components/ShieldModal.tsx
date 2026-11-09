import React from 'react';
import { ShieldCheck, ShieldAlert, X, EyeOff, Lock, Zap, Database } from 'lucide-react';
import { ShieldStats, BlockedTrackerItem } from '../types';

interface ShieldModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats: ShieldStats;
  blockedItems: BlockedTrackerItem[];
  onToggleShields: () => void;
  /** Whether shields are on. Defaults to true until App.tsx passes the saved `adblockEnabled` state. */
  enabled?: boolean;
}

export const ShieldModal: React.FC<ShieldModalProps> = ({
  isOpen,
  onClose,
  stats,
  blockedItems,
  onToggleShields,
  enabled = true,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            {enabled ? (
              <ShieldCheck size={20} style={{ color: 'var(--shield-green)' }} />
            ) : (
              <ShieldAlert size={20} style={{ color: 'var(--text-muted)' }} />
            )}
            <span>Neutrino Shields</span>
          </div>
          <button className="close-btn" onClick={onClose}>
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
                ? 'Blocking cross-site trackers, ads, and fingerprinting'
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

        {/* Live Blocked Log */}
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>
            Recent Interceptions
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

