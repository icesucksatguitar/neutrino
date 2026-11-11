import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export interface Space {
  id: string;
  name: string;
  icon: string;
  color: string;
  containerPartition?: string;
}

export interface TabData {
  id: string;
  spaceId: string;
  title: string;
  url: string;
  favicon?: string;
  isPinned: boolean;
  isSleeping: boolean;
  order: number;
}

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  createdAt: number;
}

export interface BrowserHistoryItem {
  url: string;
  title: string;
  timestamp: number;
}

export interface LocalSyncPayload {
  version: number;
  spaces: Space[];
  pinnedTabs: TabData[];
  bookmarks: Bookmark[];
  settings: Record<string, unknown>;
  exportedAt: number;
}

export interface PersistedState {
  spaces: Space[];
  bookmarks: Bookmark[];
  settings: Record<string, unknown>;
}

function cloneState<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function writeFileAtomicSync(targetPath: string, data: string): void {
  const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmpPath, data, 'utf-8');
    fs.renameSync(tmpPath, targetPath);
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // ignore cleanup errors
    }
    throw err;
  }
}

export class LocalStorageManager {
  private dataDir: string;
  private stateFilePath: string;
  private cachedState: PersistedState | null = null;

  constructor() {
    this.dataDir = path.join(app.getPath('userData'), 'neutrino-data');
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    this.stateFilePath = path.join(this.dataDir, 'browser-state.json');
  }

  /** Invalidates the in-memory cache so the next loadState() reads from disk. */
  public invalidateCache(): void {
    this.cachedState = null;
  }

  public loadState(): PersistedState {
    if (this.cachedState) {
      return cloneState(this.cachedState);
    }

    const defaultSpaces: Space[] = [
      { id: 'space-study', name: 'Study', icon: 'BookOpen', color: '#E4E4E7' },
      { id: 'space-work', name: 'Work', icon: 'Briefcase', color: '#A1A1AA' },
      { id: 'space-leisure', name: 'Leisure', icon: 'Coffee', color: '#71717A' },
    ];

    if (!fs.existsSync(this.stateFilePath)) {
      const initial: PersistedState = {
        spaces: defaultSpaces,
        bookmarks: [],
        settings: {
          searchEngine: 'google',
          adblockEnabled: true,
          zenSleepEnabled: true,
          theme: 'dark',
        },
      };
      this.cachedState = cloneState(initial);
      return cloneState(initial);
    }

    try {
      const content = fs.readFileSync(this.stateFilePath, 'utf-8');
      const parsed = JSON.parse(content);
      let rawSpaces: Space[] = parsed.spaces || defaultSpaces;
      // Seamlessly migrate legacy spaces (DEFAULT/PLAN/MAX -> Study/Work/Leisure)
      rawSpaces = rawSpaces.map((sp) => {
        if (sp.id === 'space-default' || sp.name === 'DEFAULT' || sp.id === 'space-study') {
          return { id: 'space-study', name: 'Study', icon: 'BookOpen', color: '#E4E4E7' };
        }
        if (sp.id === 'space-plan' || sp.name === 'PLAN' || sp.id === 'space-work') {
          return { id: 'space-work', name: 'Work', icon: 'Briefcase', color: '#A1A1AA' };
        }
        if (sp.id === 'space-max' || sp.name === 'MAX' || sp.id === 'space-leisure') {
          return { id: 'space-leisure', name: 'Leisure', icon: 'Coffee', color: '#71717A' };
        }
        return sp;
      });
      const state: PersistedState = {
        spaces: rawSpaces,
        bookmarks: parsed.bookmarks || [],
        settings: parsed.settings || {},
      };
      this.cachedState = cloneState(state);
      return cloneState(state);
    } catch {
      const fallback: PersistedState = {
        spaces: defaultSpaces,
        bookmarks: [],
        settings: {},
      };
      this.cachedState = cloneState(fallback);
      return cloneState(fallback);
    }
  }

  public saveState(state: {
    spaces: Space[];
    bookmarks?: Bookmark[];
    settings?: Record<string, unknown>;
  }) {
    try {
      const existing = this.loadState();
      const payload: PersistedState = {
        spaces: state.spaces,
        bookmarks: state.bookmarks || existing.bookmarks,
        settings: state.settings || existing.settings,
      };
      writeFileAtomicSync(this.stateFilePath, JSON.stringify(payload, null, 2));
      this.cachedState = cloneState(payload);
    } catch (err) {
      console.error('[Storage Error] Failed to persist state:', err);
    }
  }

  /** Writes the full settings object and keeps the saved spaces and bookmarks unchanged. */
  public saveSettings(settings: Record<string, unknown>) {
    try {
      const existing = this.loadState();
      const payload: PersistedState = {
        spaces: existing.spaces,
        bookmarks: existing.bookmarks,
        settings,
      };
      writeFileAtomicSync(this.stateFilePath, JSON.stringify(payload, null, 2));
      this.cachedState = cloneState(payload);
    } catch (err) {
      console.error('[Storage Error] Failed to persist settings:', err);
    }
  }

  /** Merges a partial settings patch into cached settings and persists atomically. */
  public patchSettings(patch: Record<string, unknown>): Record<string, unknown> {
    const existing = this.loadState();
    const merged = { ...existing.settings, ...patch };
    this.saveSettings(merged);
    return cloneState(merged);
  }

  public exportSyncPackage(): string {
    const state = this.loadState();
    const pkg: LocalSyncPayload = {
      version: 1,
      spaces: state.spaces,
      pinnedTabs: [],
      bookmarks: state.bookmarks,
      settings: state.settings,
      exportedAt: Date.now(),
    };
    return JSON.stringify(pkg, null, 2);
  }

  public importSyncPackage(jsonString: string): boolean {
    try {
      const parsed: LocalSyncPayload = JSON.parse(jsonString);
      if (!parsed.version || !parsed.spaces) return false;
      this.saveState({
        spaces: parsed.spaces,
        bookmarks: parsed.bookmarks || [],
        settings: parsed.settings || {},
      });
      return true;
    } catch {
      return false;
    }
  }
}

