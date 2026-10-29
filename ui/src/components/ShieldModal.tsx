import React from 'react';
import { Shield, ShieldCheck, ShieldAlert, X, EyeOff, Lock, Fingerprint, Database } from 'lucide-react';
import { ShieldStats, BlockedItem, BrowserSettings } from '../types/browser';

interface ShieldModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentHost: string;
  stats: ShieldStats;
  blockedItems: BlockedItem[];
  settings: BrowserSettings;
  onToggleShields: () => void;
}

export const ShieldModal: React.FC<ShieldModalProps> = ({
  isOpen,
  onClose,
  currentHost,
  stats,
  blockedItems,
  settings,
  onToggleShields,
}) => {
  if (!isOpen) return null;

  return (
    <div className="shield-modal-backdrop" onClick={onClose}>
      <div className="shield-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="shield-modal-header">
          <div className="shield-header-title">
            {settings.shieldsActive ? (
              <ShieldCheck size={20} className="shield-status-icon active" />
            ) : (
              <ShieldAlert size={20} className="shield-status-icon inactive" />
            )}
            <div>
              <h3>Neutrino Shield</h3>
              <p className="shield-hostname">{currentHost || 'Global Browser Protection'}</p>
            </div>
          </div>
          <button className="close-modal-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Master Toggle */}
        <div className="shield-master-card">
          <div className="shield-master-info">
            <span className="master-title">
              Shields are {settings.shieldsActive ? 'UP' : 'DOWN'}
            </span>
            <span className="master-desc">
              {settings.shieldsActive
                ? 'Defending against fingerprinting, trackers, and cross-site data harvesting'
                : 'Protection is temporarily suspended for this site'}
            </span>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.shieldsActive}
              onChange={onToggleShields}
            />
            <span className="slider round"></span>
          </label>
        </div>

        {/* Stats Grid */}
        <div className="shield-stats-grid">
          <div className="stat-card">
            <div className="stat-icon-wrapper red">
              <EyeOff size={15} />
            </div>
            <div className="stat-details">
              <span className="stat-number">{stats.totalBlocked}</span>
              <span className="stat-label">Trackers & Ads Blocked</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon-wrapper purple">
              <Fingerprint size={15} />
            </div>
            <div className="stat-details">
              <span className="stat-number">{stats.activeRulesCount}</span>
              <span className="stat-label">Active Engine Rules</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon-wrapper green">
              <Lock size={15} />
            </div>
            <div className="stat-details">
              <span className="stat-number">100%</span>
              <span className="stat-label">Cookie Isolation (dFPI)</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon-wrapper blue">
              <Database size={15} />
            </div>
            <div className="stat-details">
              <span className="stat-number">DoH</span>
              <span className="stat-label">Encrypted DNS (Quad9/CF)</span>
            </div>
          </div>
        </div>

        {/* Real-time Blocked Items Breakdown */}
        <div className="shield-blocked-list-section">
          <h4>Interceptions in this session</h4>
          <div className="shield-blocked-scroll">
            {blockedItems.length === 0 ? (
              <div className="empty-blocked">No tracking elements detected on this page.</div>
            ) : (
              blockedItems.map((item, idx) => (
                <div key={idx} className="blocked-row">
                  <div className="blocked-domain-info">
                    <span className="blocked-domain">{item.domain}</span>
                    <span className="blocked-rule">{item.rule}</span>
                  </div>
                  <span className={`category-tag ${item.category.toLowerCase()}`}>
                    {item.category}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer info */}
        <div className="shield-footer">
          <Shield size={12} />
          <span>Powered by Rust Native Filter Engine v0.1.0</span>
        </div>
      </div>
    </div>
  );
};

