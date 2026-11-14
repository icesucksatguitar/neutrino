import React, { useEffect, useId, useState } from 'react';
import {
  X,
  Moon,
  Sun,
  Palette,
  Shield,
  Search,
  Zap,
  Layers,
  KeyRound,
  SlidersHorizontal,
} from 'lucide-react';
import {
  ARCHIVE_INTERVAL_OPTIONS,
  SEARCH_ENGINES,
  type ArchiveIntervalHours,
  type SearchEngineId,
} from '../../main/settings';
import type { BrowserSettings, TabState } from '../types';
import { ProfilesSettings } from './ProfilesSettings';
import { PasswordsSettings } from './PasswordsSettings';

export type SettingsTabId =
  | 'appearance'
  | 'privacy'
  | 'search'
  | 'performance'
  | 'profiles'
  | 'passwords';

export interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: BrowserSettings;
  onUpdateSettings: (patch: Partial<BrowserSettings>) => void;
  isDarkMode: boolean;
  /** Same side effects as the top-bar theme button; `true` picks Dark, `false` picks Light. */
  onSetDarkMode: (dark: boolean) => void;
  /** Opens the Theme & Appearance modal. The panel closes itself first. */
  onOpenThemeStudio: () => void;
  userName: string;
  onUserNameChange: (name: string) => void;
  /** Open tabs, so profile/space deletion can say what it closes (R1.7, R13.8). Optional. */
  tabs?: TabState[];
  /** Optionally open with a specific tab selected. */
  initialTab?: SettingsTabId;
}

export const ZEN_SLEEP_HINT = 'Sleeps tabs after 10 minutes of inactivity';

const ENGINE_IDS = Object.keys(SEARCH_ENGINES) as SearchEngineId[];

export const ARCHIVE_INTERVAL_LABELS: Readonly<Record<string, string>> = Object.freeze({
  '12': '12 hours',
  '24': '24 hours',
  '168': '7 days',
  '720': '30 days',
  never: 'Never',
});

export const ARCHIVE_INTERVAL_HINT = 'Closes inactive Today tabs and keeps them in the archive';
export const SIDEBAR_AUTO_HIDE_HINT = 'Hides the sidebar until the pointer reaches the left edge';
export const RIGHT_PINS_DOCK_HINT = 'Shows the pinned sites dock on the right edge';

const archiveIntervalLabel = (value: ArchiveIntervalHours): string =>
  ARCHIVE_INTERVAL_LABELS[String(value)];

interface SwitchProps {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
}

const SettingsSwitch: React.FC<SwitchProps> = ({ checked, label, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    className={`settings-switch${checked ? ' on' : ''}`}
    onClick={() => onChange(!checked)}
  >
    <span className="settings-switch-thumb" aria-hidden="true" />
  </button>
);

interface SettingsTabMeta {
  id: SettingsTabId;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  title: string;
  description: string;
}

export const SETTINGS_TABS: readonly SettingsTabMeta[] = [
  {
    id: 'appearance',
    label: 'Appearance',
    icon: Palette,
    title: 'Appearance & Theme',
    description: 'Customize theme mode, space colors, display greeting, and sidebar layout',
  },
  {
    id: 'privacy',
    label: 'Privacy',
    icon: Shield,
    title: 'Privacy & Shields',
    description: 'Protect your browsing data, block tracking, and control website shields',
  },
  {
    id: 'search',
    label: 'Search',
    icon: Search,
    title: 'Search Engine',
    description: 'Select your default search provider for omnibox queries and address bar navigation',
  },
  {
    id: 'performance',
    label: 'Performance',
    icon: Zap,
    title: 'Performance & Storage',
    description: 'Optimize memory usage, background tab sleeping, and automatic tab archiving',
  },
  {
    id: 'profiles',
    label: 'Profiles & Spaces',
    icon: Layers,
    title: 'Profiles & Spaces',
    description: 'Manage browser profiles, organize spaces, and customize space colors',
  },
  {
    id: 'passwords',
    label: 'Passwords',
    icon: KeyRound,
    title: 'Passwords Vault',
    description: 'Securely manage stored credentials, search logins, and import or export data',
  },
];

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  isDarkMode,
  onSetDarkMode,
  onOpenThemeStudio,
  userName,
  onUserNameChange,
  tabs,
  initialTab = 'appearance',
}) => {
  const idBase = useId();
  const titleId = `${idBase}-title`;
  const nameId = `${idBase}-name`;

  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const [nameDraft, setNameDraft] = useState(userName);

  // Fresh form state each time the panel opens, and follow name changes made elsewhere.
  useEffect(() => {
    if (isOpen) {
      setNameDraft(userName);
      setActiveTab(initialTab);
    }
  }, [isOpen, userName, initialTab]);

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

  if (!isOpen) return null;

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNameDraft(userName);
      return;
    }
    setNameDraft(trimmed);
    if (trimmed !== userName.trim()) onUserNameChange(trimmed);
  };

  const openThemeStudio = () => {
    onClose();
    onOpenThemeStudio();
  };

  const handleTablistKeyDown = (e: React.KeyboardEvent) => {
    const currentIndex = SETTINGS_TABS.findIndex((t) => t.id === activeTab);
    if (currentIndex < 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % SETTINGS_TABS.length;
      const nextTab = SETTINGS_TABS[nextIndex];
      setActiveTab(nextTab.id);
      document.getElementById(`${idBase}-tab-${nextTab.id}`)?.focus();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + SETTINGS_TABS.length) % SETTINGS_TABS.length;
      const prevTab = SETTINGS_TABS[prevIndex];
      setActiveTab(prevTab.id);
      document.getElementById(`${idBase}-tab-${prevTab.id}`)?.focus();
    }
  };

  const currentTabMeta =
    SETTINGS_TABS.find((t) => t.id === activeTab) ?? SETTINGS_TABS[0];

  return (
    <div className="modal-overlay settings-overlay" onClick={onClose}>
      <div
        className="modal-content-card settings-panel-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Navigation Sidebar */}
        <aside className="settings-nav-sidebar" aria-label="Settings navigation">
          <div className="modal-header settings-nav-header">
            <div className="settings-nav-brand">
              <SlidersHorizontal size={17} className="settings-brand-icon" aria-hidden="true" />
              <span className="modal-title" id={titleId}>
                Settings
              </span>
            </div>
          </div>

          <nav
            className="settings-nav-list"
            role="tablist"
            aria-label="Settings categories"
            onKeyDown={handleTablistKeyDown}
          >
            {SETTINGS_TABS.map((tab) => {
              const Icon = tab.icon;
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`${idBase}-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  aria-controls={`${idBase}-tabpanel-${tab.id}`}
                  aria-label={`${tab.label} settings`}
                  className={`settings-nav-tab${isSelected ? ' active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon size={16} className="settings-tab-icon" aria-hidden="true" />
                  <span className="settings-tab-label">{tab.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="settings-nav-footer">
            <span className="settings-nav-hint">
              <kbd className="settings-kbd">Esc</kbd> to close
            </span>
          </div>
        </aside>

        {/* Right Content Area */}
        <main className="settings-content-pane">
          <header className="settings-pane-header">
            <div className="settings-pane-header-text">
              <h2 className="settings-pane-title">{currentTabMeta.title}</h2>
              <p className="settings-pane-description">{currentTabMeta.description}</p>
            </div>
            <button
              type="button"
              className="close-btn settings-close-btn"
              onClick={onClose}
              title="Close settings"
              aria-label="Close settings"
            >
              <X size={16} />
            </button>
          </header>

          <div className="settings-content-scroll">
            {/* 1. Appearance Tab */}
            <div
              role="tabpanel"
              id={`${idBase}-tabpanel-appearance`}
              aria-labelledby={`${idBase}-tab-appearance`}
              hidden={activeTab !== 'appearance'}
              className="settings-tabpanel"
            >
              <section className="settings-section" aria-label="Appearance">
                <h3 className="settings-section-title">Appearance</h3>

                <div className="settings-card">
                  <div className="settings-row">
                    <div className="settings-row-text">
                      <span className="settings-row-label">Mode</span>
                      <span className="settings-hint">Select your preferred color scheme</span>
                    </div>
                    <div className="settings-segmented" role="radiogroup" aria-label="Theme mode">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={isDarkMode}
                        aria-label="Dark"
                        className={`settings-segment${isDarkMode ? ' active' : ''}`}
                        onClick={() => {
                          if (!isDarkMode) onSetDarkMode(true);
                        }}
                      >
                        <Moon size={13} aria-hidden="true" />
                        Dark
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={!isDarkMode}
                        aria-label="Light"
                        className={`settings-segment${!isDarkMode ? ' active' : ''}`}
                        onClick={() => {
                          if (isDarkMode) onSetDarkMode(false);
                        }}
                      >
                        <Sun size={13} aria-hidden="true" />
                        Light
                      </button>
                    </div>
                  </div>

                  <div className="settings-divider" />

                  <div className="settings-row">
                    <div className="settings-row-text">
                      <span className="settings-row-label">Colors</span>
                      <span className="settings-hint">Customize space colors, gradients, and ambient glows</span>
                    </div>
                    <button
                      type="button"
                      className="settings-button"
                      aria-label="Theme & accent"
                      onClick={openThemeStudio}
                    >
                      <Palette size={13} aria-hidden="true" />
                      Theme &amp; accent
                    </button>
                  </div>

                  <div className="settings-divider" />

                  <div className="settings-row">
                    <div className="settings-row-text">
                      <label className="settings-row-label" htmlFor={nameId}>
                        Display name
                      </label>
                      <span className="settings-hint">Used for home greeting and profile identity</span>
                    </div>
                    <input
                      id={nameId}
                      className="settings-input settings-name-input"
                      type="text"
                      aria-label="Display name"
                      value={nameDraft}
                      maxLength={40}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onBlur={commitName}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitName();
                        }
                      }}
                    />
                  </div>
                </div>

                <div className="settings-card">
                  <div className="settings-row">
                    <div className="settings-row-text">
                      <span className="settings-row-label">Auto-hide sidebar</span>
                      <span className="settings-hint">{SIDEBAR_AUTO_HIDE_HINT}</span>
                    </div>
                    <SettingsSwitch
                      checked={settings.sidebarAutoHide}
                      label="Auto-hide sidebar"
                      onChange={(next) => onUpdateSettings({ sidebarAutoHide: next })}
                    />
                  </div>

                  <div className="settings-divider" />

                  <div className="settings-row">
                    <div className="settings-row-text">
                      <span className="settings-row-label">Right pins dock</span>
                      <span className="settings-hint">{RIGHT_PINS_DOCK_HINT}</span>
                    </div>
                    <SettingsSwitch
                      checked={settings.rightPinsDockVisible}
                      label="Show right pins dock"
                      onChange={(next) => onUpdateSettings({ rightPinsDockVisible: next })}
                    />
                  </div>
                </div>
              </section>
            </div>

            {/* 2. Privacy Tab */}
            <div
              role="tabpanel"
              id={`${idBase}-tabpanel-privacy`}
              aria-labelledby={`${idBase}-tab-privacy`}
              hidden={activeTab !== 'privacy'}
              className="settings-tabpanel"
            >
              <section className="settings-section" aria-label="Privacy">
                <h3 className="settings-section-title">Privacy</h3>

                <div className="settings-card">
                  <div className="settings-row">
                    <div className="settings-row-text">
                      <span className="settings-row-label">Shields</span>
                      <span className="settings-hint">Blocks ads, trackers and fingerprinting</span>
                    </div>
                    <SettingsSwitch
                      checked={settings.adblockEnabled}
                      label="Shields"
                      onChange={(next) => onUpdateSettings({ adblockEnabled: next })}
                    />
                  </div>
                </div>

                <div className="settings-info-card">
                  <div className="settings-info-header">
                    <Shield size={14} className="settings-info-icon" aria-hidden="true" />
                    <span className="settings-info-title">Shields Active Protection</span>
                  </div>
                  <p className="settings-info-text">
                    Neutrino shields block known tracking domains, intrusive scripts, and analytics beacons automatically. Website cookies, sessions, and storage remain strictly partitioned per profile.
                  </p>
                </div>
              </section>
            </div>

            {/* 3. Search Tab */}
            <div
              role="tabpanel"
              id={`${idBase}-tabpanel-search`}
              aria-labelledby={`${idBase}-tab-search`}
              hidden={activeTab !== 'search'}
              className="settings-tabpanel"
            >
              <section className="settings-section" aria-label="Search">
                <h3 className="settings-section-title">Search</h3>

                <div className="settings-card">
                  <div className="settings-row-text" style={{ marginBottom: 10 }}>
                    <span className="settings-row-label">Default Search Engine</span>
                    <span className="settings-hint">Used for address bar queries and suggestions</span>
                  </div>
                  <div
                    className="settings-segmented settings-segmented-full"
                    role="radiogroup"
                    aria-label="Search engine"
                  >
                    {ENGINE_IDS.map((id) => {
                      const selected = settings.searchEngine === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          aria-label={SEARCH_ENGINES[id].label}
                          className={`settings-segment${selected ? ' active' : ''}`}
                          onClick={() => {
                            if (!selected) onUpdateSettings({ searchEngine: id });
                          }}
                        >
                          {SEARCH_ENGINES[id].label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            </div>

            {/* 4. Performance Tab */}
            <div
              role="tabpanel"
              id={`${idBase}-tabpanel-performance`}
              aria-labelledby={`${idBase}-tab-performance`}
              hidden={activeTab !== 'performance'}
              className="settings-tabpanel"
            >
              <section className="settings-section" aria-label="Performance">
                <h3 className="settings-section-title">Performance</h3>

                <div className="settings-card">
                  <div className="settings-row">
                    <div className="settings-row-text">
                      <span className="settings-row-label">Zen auto-sleep</span>
                      <span className="settings-hint">{ZEN_SLEEP_HINT}</span>
                    </div>
                    <SettingsSwitch
                      checked={settings.zenSleepEnabled}
                      label="Zen auto-sleep"
                      onChange={(next) => onUpdateSettings({ zenSleepEnabled: next })}
                    />
                  </div>

                  <div className="settings-divider" />

                  <div className="settings-row-text" style={{ marginTop: 4 }}>
                    <span className="settings-row-label">Archive tabs after</span>
                    <span className="settings-hint">{ARCHIVE_INTERVAL_HINT}</span>
                  </div>
                  <div
                    className="settings-segmented settings-segmented-full"
                    role="radiogroup"
                    aria-label="Archive interval"
                    style={{ marginTop: 8 }}
                  >
                    {ARCHIVE_INTERVAL_OPTIONS.map((value) => {
                      const selected = settings.archiveIntervalHours === value;
                      const label = archiveIntervalLabel(value);
                      return (
                        <button
                          key={String(value)}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          aria-label={`Archive after ${label}`}
                          className={`settings-segment${selected ? ' active' : ''}`}
                          onClick={() => {
                            if (!selected) onUpdateSettings({ archiveIntervalHours: value });
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            </div>

            {/* 5. Profiles & Spaces Tab */}
            <div
              role="tabpanel"
              id={`${idBase}-tabpanel-profiles`}
              aria-labelledby={`${idBase}-tab-profiles`}
              hidden={activeTab !== 'profiles'}
              className="settings-tabpanel"
            >
              <ProfilesSettings tabs={tabs} />
            </div>

            {/* 6. Passwords Tab */}
            <div
              role="tabpanel"
              id={`${idBase}-tabpanel-passwords`}
              aria-labelledby={`${idBase}-tab-passwords`}
              hidden={activeTab !== 'passwords'}
              className="settings-tabpanel"
            >
              <PasswordsSettings />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
