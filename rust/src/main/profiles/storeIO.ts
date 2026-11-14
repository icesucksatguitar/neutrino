// File and session I/O for ProfileStore in the app (task 8.10).
//
// No Electron imports: the session lookup (`session.fromPartition`) and the
// per-profile history removal are injected, so tests drive this with fakes.
//
// Migration outcome decides where state comes from:
// - `skipped`: `profiles.json` already carries the current schema; read it.
// - `migrated`: use the freshly migrated file (already written by migration).
// - `failed`: run on the in-memory Default profile on `persist:neutrino` and
//   write nothing, so the pre-migration data stays exactly as it was (R5.6)
//   and migration is retried on the next start.
import fs from 'fs';
import path from 'path';
import { writeFileAtomicSync } from '../atomicFile';
import { vaultFileName } from '../passwords/vault';
import { PROFILES_FILE, type MigrationResult } from './migration';
import { parseProfilesFile, serializeProfilesFile, type ProfileStoreIO } from './store';
import type { ProfilesFile } from './types';

/** The slice of an Electron Session that profile deletion clears. */
export interface ClearableSession {
  clearStorageData(): Promise<void>;
  clearCache(): Promise<void>;
}

export interface ProfileStoreIODeps {
  dataDir: string;
  migration: MigrationResult;
  /** In the app: `session.fromPartition`. */
  fromPartition: (partition: string) => ClearableSession;
  /** Deletes a profile's history file and drops its manager (HistoryRegistry.remove). */
  removeHistory: (profileId: string) => void;
  /** Atomic write; defaults to `writeFileAtomicSync`. */
  writeFileAtomic?: (filePath: string, data: string) => void;
  /** Reads a file, or null when missing; defaults to fs. */
  readFile?: (filePath: string) => string | null;
  /** Deletes a file if present; defaults to fs.rmSync(force). */
  removeFile?: (filePath: string) => void;
  logError?: (message: string, err: unknown) => void;
}

function defaultReadFile(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}

function defaultRemoveFile(filePath: string): void {
  fs.rmSync(filePath, { force: true });
}

export function createProfileStoreIO(deps: ProfileStoreIODeps): ProfileStoreIO {
  const profilesPath = path.join(deps.dataDir, PROFILES_FILE);
  const writeAtomic = deps.writeFileAtomic ?? writeFileAtomicSync;
  const readFile = deps.readFile ?? defaultReadFile;
  const removeFile = deps.removeFile ?? defaultRemoveFile;
  const logError = deps.logError ?? ((message: string, err: unknown) => console.error(message, err));
  const runtimeOnly = deps.migration.status === 'failed';

  return {
    read(): ProfilesFile | null {
      if (deps.migration.status !== 'skipped') return deps.migration.profiles;
      try {
        const raw = readFile(profilesPath);
        return raw === null ? null : parseProfilesFile(raw);
      } catch (err) {
        logError('[Profiles] Failed to read profiles.json', err);
        return null;
      }
    },

    write(file: ProfilesFile): void {
      if (runtimeOnly) return;
      try {
        writeAtomic(profilesPath, serializeProfilesFile(file));
      } catch (err) {
        logError('[Profiles] Failed to write profiles.json', err);
      }
    },

    async clearSession(partition: string): Promise<void> {
      const sess = deps.fromPartition(partition);
      await sess.clearStorageData();
      await sess.clearCache();
    },

    rmFiles(profileId: string): void {
      try {
        deps.removeHistory(profileId);
      } catch (err) {
        logError(`[Profiles] Failed to delete history of ${profileId}`, err);
      }
      try {
        removeFile(path.join(deps.dataDir, vaultFileName(profileId)));
      } catch (err) {
        logError(`[Profiles] Failed to delete vault of ${profileId}`, err);
      }
    },
  };
}
