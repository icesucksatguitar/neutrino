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

export class LocalStorageManager {
  private dataDir: string;
  private stateFilePath: string;

  constructor() {
    this.dataDir = path.join(app.getPath('userData'), 'neutrino-data');
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    this.stateFilePath = path.join(this.dataDir, 'browser-state.json');
  }

  public loadState(): {
    spaces: Space[];
    bookmarks: Bookmark[];
    settings: Record<string, unknown>;
  } {
    const defaultSpaces: Space[] = [
      { id: 'space-study', name: 'Study', icon: 'BookOpen', color: '#E4E4E7' },
      { id: 'space-work', name: 'Work', icon: 'Briefcase', color: '#A1A1AA' },
      { id: 'space-leisure', name: 'Leisure', icon: 'Coffee', color: '#71717A' },
    ];

    if (!fs.existsSync(this.stateFilePath)) {
      return {
        spaces: defaultSpaces,
        bookmarks: [],
        settings: {
          searchEngine: 'https://www.google.com/search?q=',
          adblockEnabled: true,
          zenSleepEnabled: true,
          theme: 'dark',
        },
      };
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
      return {
        spaces: rawSpaces,
        bookmarks: parsed.bookmarks || [],
        settings: parsed.settings || {},
      };
    } catch {
      return {
        spaces: defaultSpaces,
        bookmarks: [],
        settings: {},
      };
    }
  }

  public saveState(state: {
    spaces: Space[];
    bookmarks?: Bookmark[];
    settings?: Record<string, unknown>;
  }) {
    try {
      const existing = this.loadState();
      const payload = {
        spaces: state.spaces,
        bookmarks: state.bookmarks || existing.bookmarks,
        settings: state.settings || existing.settings,
      };
      fs.writeFileSync(this.stateFilePath, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Storage Error] Failed to persist state:', err);
    }
  }

  /** Writes the full settings object and keeps the saved spaces and bookmarks unchanged. */
  public saveSettings(settings: Record<string, unknown>) {
    try {
      const existing = this.loadState();
      const payload = {
        spaces: existing.spaces,
        bookmarks: existing.bookmarks,
        settings,
      };
      fs.writeFileSync(this.stateFilePath, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Storage Error] Failed to persist settings:', err);
    }
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

