import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockUserDataDir = '';

vi.mock('electron', () => ({
  app: {
    getPath: () => mockUserDataDir,
  },
}));

import { BrowserManager } from '../../src/main/browserManager';
import { LocalStorageManager } from '../../src/main/sync/storage';

function createCollaborators() {
  const adblockEngine = {
    getStats: () => ({
      totalBlocked: 0,
      adsBlocked: 0,
      trackersBlocked: 0,
      analyticsBlocked: 0,
      fingerprintersBlocked: 0,
      dataSavedKb: 0,
    }),
    cleanUrl: (u: string) => u,
  } as any;

  const resourceManager = {
    setOnSleepCallback: vi.fn(),
    getTotalMemorySavedMb: () => 0,
    getSleepingTabsCount: () => 0,
    registerTab: vi.fn(),
    unregisterTab: vi.fn(),
    wakeTab: vi.fn(),
    sleepTab: vi.fn(),
    sleepAllBackgroundTabs: vi.fn(),
  } as any;

  const mcpServer = {
    registerTool: vi.fn(),
  } as any;

  return { adblockEngine, resourceManager, mcpServer };
}

describe('Spaces creation, deletion, and persistence (Issue #1)', () => {
  beforeEach(() => {
    mockUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neutrino-spaces-test-'));
  });

  afterEach(() => {
    if (mockUserDataDir) {
      fs.rmSync(mockUserDataDir, { recursive: true, force: true });
      mockUserDataDir = '';
    }
  });

  it('rejects empty/whitespace names and creates unique, active, persisted custom spaces', () => {
    const storage1 = new LocalStorageManager();
    const collabs1 = createCollaborators();
    const bm1 = new BrowserManager(
      collabs1.adblockEngine,
      collabs1.resourceManager,
      collabs1.mcpServer,
      storage1
    );

    const sentUpdates: any[] = [];
    bm1.setMainWindow({
      isDestroyed: () => false,
      webContents: {
        send: (_channel: string, payload: any) => sentUpdates.push(payload),
      },
    } as any);

    const initialCount = bm1.getSpaces().length;
    expect(bm1.createSpace('')).toBeNull();
    expect(bm1.createSpace('   \t  ')).toBeNull();
    expect(bm1.getSpaces()).toHaveLength(initialCount);

    const first = bm1.createSpace('  Research  ', '#10B981');
    const second = bm1.createSpace('Gaming');

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first!.name).toBe('Research');
    expect(first!.color).toBe('#10B981');
    expect(first!.id).not.toBe(second!.id);
    expect(second!.name).toBe('Gaming');
    expect(second!.color).toMatch(/^#[0-9a-fA-F]{6}$/);

    // Newly created space is selected and receives an initial tab
    expect(bm1.getActiveSpaceId()).toBe(second!.id);
    const snapshot = bm1.getStateSnapshot();
    expect(snapshot.spaces.map((s) => s.name)).toContain('Research');
    expect(snapshot.spaces.map((s) => s.name)).toContain('Gaming');
    expect(snapshot.tabs.some((t) => t.spaceId === first!.id)).toBe(true);
    expect(snapshot.tabs.some((t) => t.spaceId === second!.id)).toBe(true);
    expect(sentUpdates.length).toBeGreaterThan(0);

    // Simulated restart reads persisted spaces & activeSpaceId from disk
    const storage2 = new LocalStorageManager();
    const collabs2 = createCollaborators();
    const bm2 = new BrowserManager(
      collabs2.adblockEngine,
      collabs2.resourceManager,
      collabs2.mcpServer,
      storage2
    );

    expect(bm2.getSpaces().map((s) => s.id)).toContain(first!.id);
    expect(bm2.getSpaces().map((s) => s.id)).toContain(second!.id);
    expect(bm2.getActiveSpaceId()).toBe(second!.id);
  });

  it('deletes custom spaces cleanly without allowing deletion of the last space', () => {
    const storage = new LocalStorageManager();
    const collabs = createCollaborators();
    const bm = new BrowserManager(
      collabs.adblockEngine,
      collabs.resourceManager,
      collabs.mcpServer,
      storage
    );

    const custom = bm.createSpace('Temp Workspace')!;
    expect(bm.getActiveSpaceId()).toBe(custom.id);
    expect(bm.deleteSpace(custom.id)).toBe(true);
    expect(bm.getSpaces().some((s) => s.id === custom.id)).toBe(false);
    expect(bm.getActiveSpaceId()).toBe('space-study');

    // Never deletes the last remaining space
    for (const sp of [...bm.getSpaces()]) {
      if (bm.getSpaces().length > 1) {
        expect(bm.deleteSpace(sp.id)).toBe(true);
      }
    }
    expect(bm.getSpaces()).toHaveLength(1);
    expect(bm.deleteSpace(bm.getSpaces()[0].id)).toBe(false);
    expect(bm.getSpaces()).toHaveLength(1);
  });

  it('isolates tabs per Space, remembers each Space active tab when switching, and persists session tabs across restarts (Issue #2)', () => {
    const storage1 = new LocalStorageManager();
    const collabs1 = createCollaborators();
    const bm1 = new BrowserManager(
      collabs1.adblockEngine,
      collabs1.resourceManager,
      collabs1.mcpServer,
      storage1
    );

    const studyTab1 = bm1.createTab('https://example.com/study-1', 'space-study');
    const studyTab2 = bm1.createTab('https://example.com/study-2', 'space-study');
    bm1.updateTab(studyTab2.id, { title: 'Study Docs' });
    // Study active tab is now studyTab2

    // Switch to Work and create 2 tabs, make workTab1 active
    expect(bm1.setActiveSpace('space-work')).toBe(true);
    const workTab1 = bm1.createTab('https://example.com/work-1', 'space-work');
    const workTab2 = bm1.createTab('https://example.com/work-2', 'space-work');
    bm1.setActiveTab(workTab1.id);
    expect(bm1.getActiveSpaceId()).toBe('space-work');
    expect(bm1.getActiveTab()?.id).toBe(workTab1.id);

    // Switching back to Study must restore studyTab2 (not reset to studyTab1 / [0])
    expect(bm1.setActiveSpace('space-study')).toBe(true);
    expect(bm1.getActiveSpaceId()).toBe('space-study');
    expect(bm1.getActiveTab()?.id).toBe(studyTab2.id);

    // Switching to Work again must restore workTab1 (not workTab2)
    expect(bm1.setActiveSpace('space-work')).toBe(true);
    expect(bm1.getActiveTab()?.id).toBe(workTab1.id);
    bm1.flushSessionState();

    // Restart browser with fresh LocalStorageManager & BrowserManager
    const storage2 = new LocalStorageManager();
    const collabs2 = createCollaborators();
    const bm2 = new BrowserManager(
      collabs2.adblockEngine,
      collabs2.resourceManager,
      collabs2.mcpServer,
      storage2
    );

    expect(bm2.getActiveSpaceId()).toBe('space-work');
    expect(bm2.getActiveTab()?.id).toBe(workTab1.id);
    expect(bm2.getTabs().filter((t) => t.spaceId === 'space-study').map((t) => t.url)).toContain(
      'https://example.com/study-2'
    );
    expect(bm2.setActiveSpace('space-study')).toBe(true);
    expect(bm2.getActiveTab()?.id).toBe(studyTab2.id);
    expect(bm2.getActiveTab()?.title).toBe('Study Docs');
  });
});

