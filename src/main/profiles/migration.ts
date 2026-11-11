// One-time migration of pre-feature data (`browser-state.json`) into the
// profile model (`profiles.json`). No Electron imports: the pure core and the
// runner both work against an injected IO so tests can use a fake fs.
//
// Guarantees (Requirement 5):
// - `browser-state.json` is never written. Bookmarks and `settings`
//   (including RightPinsDock `pinnedSites`) stay where they are.
// - A byte-for-byte backup of `browser-state.json` is written before
//   `profiles.json` is created or replaced.
// - Any error leaves the legacy file unchanged and yields a runtime Default
//   profile on `persist:neutrino`, so existing logins keep working.
// - History is not touched: the existing `history.json` becomes the Default
//   profile's history.
import fs from 'fs';
import path from 'path';
import { writeFileAtomicSync } from '../atomicFile';
import { DEFAULT_PARTITION, DEFAULT_PROFILE_ID } from './partition';
import { CURRENT_SCHEMA_VERSION, ProfilesFile, SpaceRecord } from './types';

export const BROWSER_STATE_FILE = 'browser-state.json';
export const PROFILES_FILE = 'profiles.json';
export const DEFAULT_PROFILE_NAME = 'Default';

export interface LegacySpace {
  id: string;
  name: string;
  icon: string;
  color: string;
}

/** Content of `browser-state.json` as written by `LocalStorageManager`. */
export interface LegacyBrowserState {
  spaces?: unknown;
  bookmarks?: unknown;
  settings?: unknown;
}

/** Spaces `LocalStorageManager.loadState` uses when none are stored. */
export const LEGACY_DEFAULT_SPACES: readonly LegacySpace[] = [
  { id: 'space-study', name: 'Study', icon: 'BookOpen', color: '#E4E4E7' },
  { id: 'space-work', name: 'Work', icon: 'Briefcase', color: '#A1A1AA' },
  { id: 'space-leisure', name: 'Leisure', icon: 'Coffee', color: '#71717A' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * Pure: maps legacy state to a `ProfilesFile`. Every legacy space goes to the
 * Default profile with id/name/icon/color preserved and `order` equal to its
 * array position. Legacy state holds no tabs, so tabs, favorites, archive and
 * never-lists start empty. Bookmarks and settings are not part of the result.
 */
export function migrateToProfiles(
  legacy: LegacyBrowserState,
  now: number = Date.now(),
): ProfilesFile {
  const rawSpaces = Array.isArray(legacy?.spaces) ? legacy.spaces : [];
  const spaces: SpaceRecord[] = [];
  rawSpaces.forEach((sp, index) => {
    if (!isRecord(sp) || typeof sp.id !== 'string') return;
    spaces.push({
      id: sp.id,
      profileId: DEFAULT_PROFILE_ID,
      name: str(sp.name, sp.id),
      icon: str(sp.icon, ''),
      color: str(sp.color, ''),
      order: index,
    });
  });
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    migratedAt: now,
    profiles: [{ id: DEFAULT_PROFILE_ID, name: DEFAULT_PROFILE_NAME, createdAt: now }],
    spaces,
    tabs: [],
    favorites: [],
    archive: [],
    neverList: {},
  };
}

/**
 * Pure: reproduces what `LocalStorageManager.loadState` shows the user today
 * (default spaces when missing, DEFAULT/PLAN/MAX renamed to Study/Work/Leisure),
 * so the migrated spaces match the spaces the user currently sees.
 * `raw === null` means `browser-state.json` does not exist.
 */
export function readLegacyState(raw: string | null): LegacyBrowserState {
  if (raw === null) return { spaces: LEGACY_DEFAULT_SPACES.map((s) => ({ ...s })) };
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) throw new Error('browser-state.json is not a JSON object');
  const spaces = Array.isArray(parsed.spaces)
    ? parsed.spaces
    : LEGACY_DEFAULT_SPACES.map((s) => ({ ...s }));
  return {
    spaces: spaces.map((sp: unknown) => {
      if (!isRecord(sp)) return sp;
      if (sp.id === 'space-default' || sp.name === 'DEFAULT' || sp.id === 'space-study') {
        return { ...LEGACY_DEFAULT_SPACES[0] };
      }
      if (sp.id === 'space-plan' || sp.name === 'PLAN' || sp.id === 'space-work') {
        return { ...LEGACY_DEFAULT_SPACES[1] };
      }
      if (sp.id === 'space-max' || sp.name === 'MAX' || sp.id === 'space-leisure') {
        return { ...LEGACY_DEFAULT_SPACES[2] };
      }
      return sp;
    }),
    bookmarks: parsed.bookmarks,
    settings: parsed.settings,
  };
}

/** File access used by the runner. Paths are absolute. */
export interface MigrationIO {
  dataDir: string;
  /** Returns file text, or `null` when the file does not exist. */
  readFile(filePath: string): string | null;
  /** Writes the whole file atomically (temp file + rename). */
  writeFileAtomic(filePath: string, data: string): void;
  now(): number;
  logError(message: string, err: unknown): void;
}

export type MigrationResult =
  | { status: 'skipped' }
  | {
      status: 'migrated';
      profiles: ProfilesFile;
      /** `null` when there was no `browser-state.json` to back up. */
      backupPath: string | null;
    }
  | {
      status: 'failed';
      /** Runtime-only Default profile built from pre-migration data; not persisted. */
      profiles: ProfilesFile;
      partition: typeof DEFAULT_PARTITION;
      error: unknown;
    };

function hasCurrentSchema(raw: string | null): boolean {
  if (raw === null) return false;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) && parsed.schemaVersion === CURRENT_SCHEMA_VERSION;
  } catch {
    return false;
  }
}

/**
 * Runs migration unless `profiles.json` already carries the current
 * `schemaVersion`. Never writes `browser-state.json`; never throws.
 */
export function runMigrationOnce(io: MigrationIO): MigrationResult {
  const statePath = path.join(io.dataDir, BROWSER_STATE_FILE);
  const profilesPath = path.join(io.dataDir, PROFILES_FILE);
  let legacyRaw: string | null = null;
  try {
    const existingProfiles = io.readFile(profilesPath);
    if (hasCurrentSchema(existingProfiles)) return { status: 'skipped' };

    legacyRaw = io.readFile(statePath);
    const ts = io.now();

    // Back up everything that is about to be read or replaced, before any change.
    let backupPath: string | null = null;
    if (legacyRaw !== null) {
      backupPath = path.join(io.dataDir, `browser-state.backup-${ts}.json`);
      io.writeFileAtomic(backupPath, legacyRaw);
    }
    if (existingProfiles !== null) {
      io.writeFileAtomic(path.join(io.dataDir, `profiles.backup-${ts}.json`), existingProfiles);
    }

    const profiles = migrateToProfiles(readLegacyState(legacyRaw), ts);
    io.writeFileAtomic(profilesPath, JSON.stringify(profiles, null, 2));
    return { status: 'migrated', profiles, backupPath };
  } catch (error) {
    io.logError('[Migration] Failed to migrate to profiles; using runtime Default profile', error);
    let legacy: LegacyBrowserState;
    try {
      legacy = readLegacyState(legacyRaw);
    } catch {
      legacy = readLegacyState(null);
    }
    return {
      status: 'failed',
      profiles: migrateToProfiles(legacy, Date.now()),
      partition: DEFAULT_PARTITION,
      error,
    };
  }
}

/** Real-filesystem IO for `runMigrationOnce`. */
export function createFsMigrationIO(dataDir: string): MigrationIO {
  return {
    dataDir,
    readFile(filePath) {
      if (!fs.existsSync(filePath)) return null;
      return fs.readFileSync(filePath, 'utf-8');
    },
    writeFileAtomic: writeFileAtomicSync,
    now: () => Date.now(),
    logError: (message, err) => console.error(message, err),
  };
}
