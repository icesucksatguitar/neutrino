import React, { useEffect, useId, useState } from 'react';
import { X, Moon, Sun, Palette, Plus } from 'lucide-react';
import {
  SEARCH_ENGINES,
  addExclusion,
  hostForExclusion,
  isHostExcluded,
  removeExclusion,
  toggleSiteExclusion,
  type SearchEngineId,
} from '../../main/settings';
import type { BrowserSettings } from '../types';

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
  activeTabUrl?: string | null;
  userName: string;
  onUserNameChange: (name: string) => void;
}

export const INVALID_SITE_MESSAGE = 'Enter a site like example.com';
export const ZEN_SLEEP_HINT = 'Sleeps tabs after 10 minutes of inactivity';

const ENGINE_IDS = Object.keys(SEARCH_ENGINES) as SearchEngineId[];

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

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  isDarkMode,
  onSetDarkMode,
  onOpenThemeStudio,
  activeTabUrl,
  userName,
  onUserNameChange,
}) => {
  const idBase = useId();
  const titleId = `${idBase}-title`;
  const nameId = `${idBase}-name`;
  const siteErrorId = `${idBase}-site-error`;

  const [nameDraft, setNameDraft] = useState(userName);
  const [siteDraft, setSiteDraft] = useState('');
  const [siteError, setSiteError] = useState<string | null>(null);

  // Fresh form state each time the panel opens, and follow name changes made elsewhere.
  useEffect(() => {
    if (isOpen) setNameDraft(userName);
  }, [isOpen, userName]);

  useEffect(() => {
    if (isOpen) {
      setSiteDraft('');
      setSiteError(null);
    }
  }, [isOpen]);

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

  const exclusions = settings.darkModeExclusions;
  const currentUrl = activeTabUrl ?? '';
  const currentHost = hostForExclusion(currentUrl);
  const currentExcluded = currentHost !== null && isHostExcluded(currentUrl, exclusions);

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNameDraft(userName);
      return;
    }
    setNameDraft(trimmed);
    if (trimmed !== userName.trim()) onUserNameChange(trimmed);
  };

  const submitSite = (e: React.FormEvent) => {
    e.preventDefault();
    const result = addExclusion(exclusions, siteDraft);
    if (result.error) {
      setSiteError(INVALID_SITE_MESSAGE);
      return;
    }
    setSiteError(null);
    setSiteDraft('');
    if (result.list.length !== exclusions.length) onUpdateSettings({ darkModeExclusions: result.list });
  };

  const openThemeStudio = () => {
    onClose();
    onOpenThemeStudio();
  };

  return (
    <div className="modal-overlay settings-overlay" onClick={onClose}>
      <div
        className="modal-content-card settings-panel-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <span className="modal-title" id={titleId}>
            Settings
          </span>
          <button type="button" className="close-btn" onClick={onClose} title="Close" aria-label="Close settings">
            <X size={15} />
          </button>
        </div>

        {/* 1. Appearance */}
        <section className="settings-section" aria-label="Appearance">
          <h3 className="settings-section-title">Appearance</h3>

          <div className="settings-row">
            <span className="settings-row-label">Mode</span>
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

          <div className="settings-row">
            <span className="settings-row-label">Colors</span>
            <button type="button" className="settings-button" aria-label="Theme & accent" onClick={openThemeStudio}>
              <Palette size={13} aria-hidden="true" />
              Theme &amp; accent
            </button>
          </div>

          <div className="settings-row">
            <label className="settings-row-label" htmlFor={nameId}>
              Display name
            </label>
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
        </section>

        {/* 2. Dark mode exclusions */}
        <section className="settings-section" aria-label="Dark mode exclusions">
          <h3 className="settings-section-title">Dark mode exclusions</h3>
          <p className="settings-hint">These sites keep their own look when dark mode is on.</p>

          {currentHost !== null && (
            <div className="settings-row settings-current-site">
              <div className="settings-current-site-info">
                <span className="settings-row-label">This site</span>
                <span className="settings-host">{currentHost}</span>
              </div>
              <button
                type="button"
                className="settings-button"
                aria-label={currentExcluded ? 'Use dark mode on this site' : 'Exclude this site'}
                onClick={() => onUpdateSettings({ darkModeExclusions: toggleSiteExclusion(exclusions, currentUrl) })}
              >
                {currentExcluded ? 'Use dark mode on this site' : 'Exclude this site'}
              </button>
            </div>
          )}

          <form className="settings-add-form" onSubmit={submitSite} noValidate>
            <input
              className={`settings-input${siteError ? ' invalid' : ''}`}
              type="text"
              placeholder="example.com"
              aria-label="Site to exclude from dark mode"
              aria-invalid={siteError ? true : undefined}
              aria-describedby={siteError ? siteErrorId : undefined}
              value={siteDraft}
              spellCheck={false}
              autoCapitalize="off"
              onChange={(e) => {
                setSiteDraft(e.target.value);
                if (siteError) setSiteError(null);
              }}
            />
            <button type="submit" className="settings-button" aria-label="Add site">
              <Plus size={13} aria-hidden="true" />
              Add
            </button>
          </form>
          {siteError && (
            <div id={siteErrorId} className="settings-error" role="alert">
              {siteError}
            </div>
          )}

          {exclusions.length === 0 ? (
            <p className="settings-hint">No sites excluded.</p>
          ) : (
            <ul className="settings-chip-list" aria-label="Excluded sites">
              {exclusions.map((host) => (
                <li key={host} className="settings-chip">
                  <span className="settings-chip-label">{host}</span>
                  <button
                    type="button"
                    className="settings-chip-remove"
                    aria-label={`Remove ${host}`}
                    title={`Remove ${host}`}
                    onClick={() => onUpdateSettings({ darkModeExclusions: removeExclusion(exclusions, host) })}
                  >
                    <X size={11} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 3. Privacy */}
        <section className="settings-section" aria-label="Privacy">
          <h3 className="settings-section-title">Privacy</h3>
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
        </section>

        {/* 4. Search */}
        <section className="settings-section" aria-label="Search">
          <h3 className="settings-section-title">Search</h3>
          <div className="settings-segmented settings-segmented-full" role="radiogroup" aria-label="Search engine">
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
        </section>

        {/* 5. Performance */}
        <section className="settings-section" aria-label="Performance">
          <h3 className="settings-section-title">Performance</h3>
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
        </section>
      </div>
    </div>
  );
};
