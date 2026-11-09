// Feature: browser-settings-panel — LocalStorageManager.saveSettings (Requirement 2.1).
// Electron's `app` is replaced so userData points at a temp directory; file I/O is real.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tmp = vi.hoisted(() => ({ dir: '' }));

vi.mock('electron', () => ({
  app: { getPath: () => tmp.dir },
}));

import { LocalStorageManager } from '../../src/main/sync/storage';

describe('LocalStorageManager.saveSettings', () => {
  beforeEach(() => {
    tmp.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neutrino-storage-'));
  });

  afterEach(() => {
    fs.rmSync(tmp.dir, { recursive: true, force: true });
  });

  it('writes the settings and keeps saved spaces and bookmarks', () => {
    const storage = new LocalStorageManager();
    const spaces = [{ id: 'space-custom', name: 'Custom', icon: 'Star', color: '#123456' }];
    const bookmarks = [{ id: 'b1', title: 'Example', url: 'https://example.com', createdAt: 1 }];
    storage.saveState({ spaces, bookmarks, settings: { theme: 'dark' } });

    const settings = {
      darkModeExclusions: ['youtube.com'],
      adblockEnabled: false,
      zenSleepEnabled: true,
      searchEngine: 'duckduckgo',
      theme: 'dark',
    };
    storage.saveSettings(settings);

    const state = storage.loadState();
    expect(state.spaces).toEqual(spaces);
    expect(state.bookmarks).toEqual(bookmarks);
    expect(state.settings).toEqual(settings);
  });

  it('creates the state file with default spaces when none exists', () => {
    const storage = new LocalStorageManager();
    storage.saveSettings({ adblockEnabled: true });

    const state = storage.loadState();
    expect(state.settings).toEqual({ adblockEnabled: true });
    expect(state.spaces.map((s) => s.id)).toEqual(['space-study', 'space-work', 'space-leisure']);
    expect(state.bookmarks).toEqual([]);
  });

  it('logs with console.error when the write fails', () => {
    const storage = new LocalStorageManager();
    const stateFile = path.join(tmp.dir, 'neutrino-data', 'browser-state.json');
    fs.mkdirSync(stateFile); // a directory where the file should be makes the write fail
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => storage.saveSettings({ adblockEnabled: false })).not.toThrow();
      expect(errSpy).toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });
});
