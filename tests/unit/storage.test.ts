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
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
    try {
      expect(() => storage.saveSettings({ adblockEnabled: false })).not.toThrow();
      expect(errSpy).toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });

  it('serves subsequent reads from the in-memory cache without hitting disk', () => {
    const storage = new LocalStorageManager();
    storage.saveSettings({
      adblockEnabled: false,
      zenSleepEnabled: true,
      searchEngine: 'brave',
      theme: 'light',
    });

    const readSpy = vi.spyOn(fs, 'readFileSync');
    try {
      const first = storage.loadState();
      const second = storage.loadState();
      expect(readSpy).not.toHaveBeenCalled();
      expect(first).toEqual(second);
    } finally {
      readSpy.mockRestore();
    }
  });

  it('deep-clones cached state so caller mutations never corrupt the cache', () => {
    const storage = new LocalStorageManager();
    storage.saveSettings({
      windowBounds: { width: 1200, height: 800, x: 50, y: 60, isMaximized: false },
    });

    const state = storage.loadState();
    (state.settings.windowBounds as { width: number }).width = 9999;
    state.spaces[0].name = 'Mutated';

    const clean = storage.loadState();
    expect((clean.settings.windowBounds as { width: number }).width).toBe(1200);
    expect(clean.spaces[0].name).toBe('Study');
  });

  it('does not poison the in-memory cache if a disk write fails', () => {
    const storage = new LocalStorageManager();
    storage.saveSettings({ searchEngine: 'duckduckgo', theme: 'light' });

    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('disk full');
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
    try {
      storage.saveSettings({ searchEngine: 'bing', theme: 'dark' });
    } finally {
      writeSpy.mockRestore();
      errSpy.mockRestore();
    }

    const afterFail = storage.loadState();
    expect(afterFail.settings).toEqual({ searchEngine: 'duckduckgo', theme: 'light' });
  });

  it('remembers patched settings (theme, windowBounds, userProfile, customTheme, pinnedSites, activeSpaceId) across restarts', () => {
    const firstLaunch = new LocalStorageManager();
    firstLaunch.saveSettings({
      adblockEnabled: true,
      zenSleepEnabled: false,
      searchEngine: 'brave',
    });
    firstLaunch.patchSettings({
      theme: 'light',
      activeSpaceId: 'space-work',
      windowBounds: { width: 1280, height: 760, x: 40, y: 30, isMaximized: false },
      customTheme: { themeId: 'clean-light', accent: '#38bdf8' },
      userProfile: { name: 'Yash', email: null, isGuest: true, theme: 'obsidian', mode: 'minimal' },
      onboardingCompleted: true,
      pinnedSites: [{ id: 'pin-gh', title: 'GitHub', url: 'https://github.com' }],
    });
    // Subsequent patch must not clobber earlier settings
    firstLaunch.patchSettings({ zenSleepEnabled: true });

    // Simulate brand-new browser launch (new LocalStorageManager instance reads from disk)
    const nextLaunch = new LocalStorageManager();
    const restored = nextLaunch.loadState().settings;
    expect(restored).toEqual({
      adblockEnabled: true,
      zenSleepEnabled: true,
      searchEngine: 'brave',
      theme: 'light',
      activeSpaceId: 'space-work',
      windowBounds: { width: 1280, height: 760, x: 40, y: 30, isMaximized: false },
      customTheme: { themeId: 'clean-light', accent: '#38bdf8' },
      userProfile: { name: 'Yash', email: null, isGuest: true, theme: 'obsidian', mode: 'minimal' },
      onboardingCompleted: true,
      pinnedSites: [{ id: 'pin-gh', title: 'GitHub', url: 'https://github.com' }],
    });
  });
});
