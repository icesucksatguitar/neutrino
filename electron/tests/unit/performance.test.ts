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

import {
  DEFAULT_SETTINGS,
  isSoftwareGpuStatus,
  normalizeReducedEffectsMode,
  normalizeSettings,
  resolveReducedEffectsActive,
} from '../../src/main/settings';
import { ZenResourceManager } from '../../src/main/resourceManager';
import { LocalStorageManager } from '../../src/main/sync/storage';
import { BrowserManager } from '../../src/main/browserManager';

describe('Reduced effects settings & GPU detection', () => {
  it('defaults reducedEffectsMode to auto and normalizes invalid inputs', () => {
    expect(DEFAULT_SETTINGS.reducedEffectsMode).toBe('auto');
    expect(normalizeReducedEffectsMode(undefined)).toBe('auto');
    expect(normalizeReducedEffectsMode('bogus')).toBe('auto');
    expect(normalizeReducedEffectsMode('on')).toBe('on');
    expect(normalizeReducedEffectsMode('off')).toBe('off');

    const normalized = normalizeSettings({ reducedEffectsMode: 'on', theme: 'light' });
    expect(normalized.reducedEffectsMode).toBe('on');
    expect(normalized.theme).toBe('light');

    const fallback = normalizeSettings({ reducedEffectsMode: 42 });
    expect(fallback.reducedEffectsMode).toBe('auto');
  });

  it('detects software rendering from Chromium GPU feature status', () => {
    expect(
      isSoftwareGpuStatus({
        gpu_compositing: 'enabled',
        rasterization: 'enabled',
        webgl: 'enabled',
      })
    ).toBe(false);

    expect(
      isSoftwareGpuStatus({
        gpu_compositing: 'disabled_software',
        rasterization: 'disabled_software',
        webgl: 'unavailable_software',
      })
    ).toBe(true);

    expect(
      isSoftwareGpuStatus({
        gpu_compositing: 'enabled',
        rasterization: 'unavailable_software',
        webgl: 'disabled_software',
      })
    ).toBe(true);
  });

  it('resolves active reduced-effects state across auto, on, and off modes', () => {
    const hwGpu = { gpu_compositing: 'enabled', rasterization: 'enabled', webgl: 'enabled' };
    const swGpu = { gpu_compositing: 'disabled_software', rasterization: 'disabled_software' };

    expect(resolveReducedEffectsActive('auto', false, hwGpu)).toBe(false);
    expect(resolveReducedEffectsActive('auto', true, hwGpu)).toBe(true);
    expect(resolveReducedEffectsActive('auto', false, swGpu)).toBe(true);

    expect(resolveReducedEffectsActive('on', false, hwGpu)).toBe(true);
    expect(resolveReducedEffectsActive('off', true, swGpu)).toBe(false);
  });
});

describe('ZenResourceManager background tab cap', () => {
  let manager: ZenResourceManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new ZenResourceManager();
  });

  afterEach(() => {
    manager.destroy();
    vi.useRealTimers();
  });

  it('sleeps the oldest non-exempt background tabs beyond maxAwakeBackgroundTabs', () => {
    const slept: string[] = [];
    manager.setOnSleepCallback((id) => slept.push(id));

    for (let i = 1; i <= 7; i++) {
      vi.advanceTimersByTime(1000);
      manager.registerTab(`tab-${i}`);
    }

    // tab-7 is active, tab-1 is pinned (exempt). Awake non-exempt background tabs: tab-2..tab-6 (5 tabs).
    // With limit 3, the 2 oldest (tab-2, tab-3) must be put to sleep.
    const count = manager.trimExcessBackgroundTabs('tab-7', new Set(['tab-1']), 3);

    expect(count).toBe(2);
    expect(slept).toEqual(['tab-2', 'tab-3']);
    expect(manager.isTabSleeping('tab-1')).toBe(false);
    expect(manager.isTabSleeping('tab-2')).toBe(true);
    expect(manager.isTabSleeping('tab-3')).toBe(true);
    expect(manager.isTabSleeping('tab-4')).toBe(false);
    expect(manager.isTabSleeping('tab-7')).toBe(false);
  });

  it('does not auto-trim background tabs when autoSleepEnabled is false', () => {
    manager.setAutoSleepEnabled(false);
    for (let i = 1; i <= 6; i++) {
      vi.advanceTimersByTime(1000);
      manager.registerTab(`tab-${i}`);
    }

    const count = manager.trimExcessBackgroundTabs('tab-6', new Set(), 2);
    expect(count).toBe(0);
    for (let i = 1; i <= 6; i++) {
      expect(manager.isTabSleeping(`tab-${i}`)).toBe(false);
    }
  });
});

describe('BrowserManager background renderer cap integration', () => {
  let resourceManager: ZenResourceManager;

  beforeEach(() => {
    vi.useFakeTimers();
    mockUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neutrino-perf-'));
    resourceManager = new ZenResourceManager();
  });

  afterEach(() => {
    resourceManager.destroy();
    vi.useRealTimers();
    fs.rmSync(mockUserDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  });

  it('keeps pinned and active tabs awake while capping excess background web tabs', () => {
    const storage = new LocalStorageManager();
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
    const mcpServer = { registerTool: vi.fn() } as any;

    const bm = new BrowserManager(adblockEngine, resourceManager, mcpServer, storage);
    const pinned = bm.createTab('https://pinned.example.com', 'space-study', true);

    const created: string[] = [];
    for (let i = 1; i <= 7; i++) {
      vi.advanceTimersByTime(1000);
      created.push(bm.createTab(`https://site-${i}.example.com`, 'space-study').id);
    }

    const tabsById = new Map(bm.getTabs().map((t) => [t.id, t]));
    expect(tabsById.get(pinned.id)?.isSleeping).toBe(false);
    expect(tabsById.get(created[created.length - 1])?.isSleeping).toBe(false);

    // 7 non-pinned web tabs created: 1 active + up to 4 background awake = 5 awake -> 2 oldest slept
    const sleptWebTabs = created.filter((id) => tabsById.get(id)?.isSleeping);
    expect(sleptWebTabs).toEqual([created[0], created[1]]);
  });
});
