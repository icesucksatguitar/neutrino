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
      { id: 'space-personal', name: 'Personal', icon: 'Home', color: '#6366f1' },
      { id: 'space-work', name: 'Work', icon: 'Briefcase', color: '#3b82f6' },
      { id: 'space-dev', name: 'Dev & AI', icon: 'Terminal', color: '#10b981' },
      { id: 'space-research', name: 'Research', icon: 'Compass', color: '#f59e0b' },
    ];

    if (!fs.existsSync(this.stateFilePath)) {
      return {
        spaces: defaultSpaces,
        bookmarks: [],
        settings: {
          searchEngine: 'https://duckduckgo.com/?q=',
          adblockEnabled: true,
          zenSleepEnabled: true,
          theme: 'dark',
        },
      };
    }

    try {
      const content = fs.readFileSync(this.stateFilePath, 'utf-8');
      const parsed = JSON.parse(content);
      return {
        spaces: parsed.spaces || defaultSpaces,
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
    bookmarks: Bookmark[];
    settings: Record<string, unknown>;
  }) {
    try {
      fs.writeFileSync(this.stateFilePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Storage Error] Failed to persist state:', err);
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

