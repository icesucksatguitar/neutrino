// Per-profile history (R4.1-R4.4). Pure Node (no Electron imports).
//
// One HistoryManager per profile, built lazily on first use. The Default
// profile keeps the legacy `history.json` so existing history survives
// migration; every other profile gets `history-<profileId>.json`.
//
// `../history` resolves to `src/main/history.ts` (a file wins over a
// directory in both TS and Node resolution, and this directory has no index).
import fs from 'fs';
import path from 'path';
import { HistoryManager, type HistoryEntry } from '../history';
import { DEFAULT_PROFILE_ID } from '../profiles/partition';

export const DEFAULT_HISTORY_FILE = 'history.json';

/** File name for a profile's history. Rejects ids that could escape the data dir. */
export function historyFileName(profileId: string): string {
  if (profileId === DEFAULT_PROFILE_ID) return DEFAULT_HISTORY_FILE;
  if (!/^[A-Za-z0-9_-]+$/.test(profileId)) {
    throw new Error(`Invalid profile id for history file: ${JSON.stringify(profileId)}`);
  }
  return `history-${profileId}.json`;
}

export interface HistoryRegistryOptions {
  /** Directory holding the history files (the app data dir). */
  dir: string;
  /** Passed through to every HistoryManager. */
  managerOptions?: { maxEntries?: number; debounceMs?: number };
}

export type HistoryRegistryListener = (profileId: string, entries: HistoryEntry[]) => void;

export class HistoryRegistry {
  private readonly dir: string;
  private readonly managerOptions?: { maxEntries?: number; debounceMs?: number };
  private readonly managers = new Map<string, HistoryManager>();
  private readonly unsubscribers = new Map<string, () => void>();
  private readonly listeners = new Set<HistoryRegistryListener>();

  constructor(options: HistoryRegistryOptions) {
    this.dir = options.dir;
    this.managerOptions = options.managerOptions;
  }

  /** Absolute path of a profile's history file. */
  filePathFor(profileId: string): string {
    return path.join(this.dir, historyFileName(profileId));
  }

  /** Returns the profile's HistoryManager, creating (and loading) it on first use. */
  for(profileId: string): HistoryManager {
    const existing = this.managers.get(profileId);
    if (existing) return existing;
    const manager = new HistoryManager(this.filePathFor(profileId), this.managerOptions);
    this.managers.set(profileId, manager);
    this.unsubscribers.set(
      profileId,
      manager.onChange((entries) => {
        for (const cb of this.listeners) {
          try {
            cb(profileId, entries);
          } catch {}
        }
      }),
    );
    return manager;
  }

  /** True when a manager for this profile has been built. */
  has(profileId: string): boolean {
    return this.managers.has(profileId);
  }

  /** Subscribes to history changes of every profile; returns an unsubscribe callback. */
  onChange(cb: HistoryRegistryListener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /**
   * Deletes a profile's history (profile deletion, R1.8). Drops the manager
   * and removes only that profile's file. The ProfileStore never removes the
   * last profile, so Default's `history.json` is touched only when Default
   * itself is explicitly deleted.
   */
  remove(profileId: string): void {
    const filePath = this.filePathFor(profileId);
    const manager = this.managers.get(profileId);
    if (manager) {
      this.unsubscribers.get(profileId)?.();
      this.unsubscribers.delete(profileId);
      this.managers.delete(profileId);
      // Clearing writes synchronously and cancels any pending debounced save,
      // so no late timer can recreate the file after it is unlinked.
      manager.clear('all');
    }
    try {
      fs.rmSync(filePath, { force: true });
    } catch (e) {
      console.error('Failed to delete history file:', e);
    }
  }

  /** Flushes pending writes of every built manager. */
  flushAll(): void {
    for (const manager of this.managers.values()) manager.flush();
  }

  /** Flushes and releases every manager (app quit). */
  destroyAll(): void {
    for (const manager of this.managers.values()) manager.destroy();
    for (const unsub of this.unsubscribers.values()) unsub();
    this.unsubscribers.clear();
    this.managers.clear();
  }
}
