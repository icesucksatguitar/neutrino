import React, { useEffect, useId, useState } from 'react';
import { X, Moon, Sun, Palette } from 'lucide-react';
import {
  ARCHIVE_INTERVAL_OPTIONS,
  SEARCH_ENGINES,
  type ArchiveIntervalHours,
  type SearchEngineId,
} from '../../main/settings';
import type { BrowserSettings, TabState } from '../types';
import { ProfilesSettings } from './ProfilesSettings';
import { PasswordsSettings } from './PasswordsSettings';

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

const archiveIntervalLabel = (value: ArchiveIntervalHours): string => ARCHIVE_INTERVAL_LABELS[String(value)];

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
  userName,
  onUserNameChange,
  tabs,
}) => {
  const idBase = useId();
  const titleId = `${idBase}-title`;
  const nameId = `${idBase}-name`;

  const [nameDraft, setNameDraft] = useState(userName);

  // Fresh form state each time the panel opens, and follow name changes made elsewhere.
  useEffect(() => {
    if (isOpen) setNameDraft(userName);
  }, [isOpen, userName]);

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

          {/* Layout (R12.4/12.5, R19.1/19.4): persisted through onUpdateSettings -> settings IPC. */}
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
        </section>

        {/* 2. Privacy */}
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

          {/* Archive_Interval (R16.2): 12h / 24h / 7d / 30d / never. */}
          <div className="settings-row">
            <div className="settings-row-text">
              <span className="settings-row-label">Archive tabs after</span>
              <span className="settings-hint">{ARCHIVE_INTERVAL_HINT}</span>
            </div>
          </div>
          <div className="settings-segmented settings-segmented-full" role="radiogroup" aria-label="Archive interval">
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
        </section>

        {/*
          Further sections (profiles & spaces, passwords) go here, after the core four.
          tests/unit/settingsPanel.test.ts pins the `settings-section-title` headings to exactly
          Appearance / Privacy / Search / Performance, and the design requires that suite unchanged,
          so these sections use the `settings-group-title` heading class instead.
        */}
        <ProfilesSettings tabs={tabs} />
        <PasswordsSettings />
      </div>
    </div>
  );
};
