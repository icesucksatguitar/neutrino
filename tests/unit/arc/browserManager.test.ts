import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { BrowserManager } from '../../../src/main/browserManager';
import { ZenResourceManager } from '../../../src/main/resourceManager';
import { McpServer } from '../../../src/main/mcp/server';
import { ProfileStore } from '../../../src/main/profiles/store';
import { HistoryRegistry } from '../../../src/main/history/registry';
import { DEFAULT_PARTITION, DEFAULT_PROFILE_ID } from '../../../src/main/profiles/partition';
import type { ProfilesFile } from '../../../src/main/profiles/types';

// Minimal shield engine: BrowserManager only needs cleanUrl and getStats.
const engine = { cleanUrl: (u: string) => u, getStats: () => ({ totalBlocked: 0 }) };

let dir: string;
let resources: ZenResourceManager[] = [];
let registries: HistoryRegistry[] = [];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neutrino-bm-'));
});
afterEach(() => {
  resources.forEach((r) => r.destroy());
  registries.forEach((r) => r.destroyAll());
  resources = [];
  registries = [];
  fs.rmSync(dir, { recursive: true, force: true });
});

function seedFile(): ProfilesFile {
  return {
    schemaVersion: 1,
    profiles: [
      { id: DEFAULT_PROFILE_ID, name: 'Default', createdAt: 1 },
      { id: 'work', name: 'Work', createdAt: 2 },
    ],
    spaces: [
      { id: 's-home', profileId: DEFAULT_PROFILE_ID, name: 'Home', icon: 'Home', color: '#111', order: 0 },
      { id: 's-read', profileId: DEFAULT_PROFILE_ID, name: 'Read', icon: 'Book', color: '#222', order: 1 },
      { id: 's-work', profileId: 'work', name: 'Job', icon: 'Briefcase', color: '#333', order: 0 },
    ],
    tabs: [],
    favorites: [],
    archive: [],
    neverList: {},
  };
}

function setup(initial: ProfilesFile = seedFile(), clock = { t: 1000 }) {
  let disk: ProfilesFile | null = initial;
  const store = new ProfileStore({
    read: () => disk,
    write: (f) => { disk = f; },
    clearSession: async () => {},
    rmFiles: () => {},
    now: () => clock.t,
  });
  const historyRegistry = new HistoryRegistry({ dir, managerOptions: { debounceMs: 0 } });
  registries.push(historyRegistry);
  const resourceManager = new ZenResourceManager();
  resources.push(resourceManager);
  const settings: Record<string, unknown> = {};
  const storage = {
    loadState: () => ({ spaces: [], bookmarks: [], settings }),
    patchSettings: (p: Record<string, unknown>) => Object.assign(settings, p),
    saveState: () => { throw new Error('saveState must not be called'); },
    exportSyncPackage: () =>
      JSON.stringify({ version: 1, spaces: [{ id: 'legacy' }], pinnedTabs: [], bookmarks: [], settings, exportedAt: 0 }),
  };
  const sent: Array<{ channel: string; payload: any }> = [];
  const win = { isDestroyed: () => false, webContents: { send: (channel: string, payload: any) => sent.push({ channel, payload }) } };
  const bm = new BrowserManager(engine as any, resourceManager, new McpServer(), storage as any, undefined, {
    profileStore: store,
    historyRegistry,
    now: () => clock.t,
  });
  bm.setMainWindow(win as any);
  return { bm, store, historyRegistry, sent, clock, disk: () => disk!, settings };
}

describe('BrowserManager (profile-aware)', () => {
  it('resolves each tab partition from its space owner and emits it (R1.2, R1.3)', () => {
    const { bm, sent } = setup();
    const a = bm.createTab('https://a.example.com/', 's-home');
    const b = bm.createTab('https://b.example.com/', 's-read');
    const w = bm.createTab('https://w.example.com/', 's-work');
    expect(a.partition).toBe(DEFAULT_PARTITION);
    expect(b.partition).toBe(DEFAULT_PARTITION);
    expect(w.partition).toBe('persist:profile-work');
    const last = sent.filter((s) => s.channel === 'neutrino:state-update').pop()!.payload;
    expect(last.tabs.map((t: any) => t.partition)).toEqual([DEFAULT_PARTITION, DEFAULT_PARTITION, 'persist:profile-work']);
    expect(last.activeProfileId).toBe('work');
  });

  it('creates Today tabs in the active space by default (R12.8)', () => {
    const { bm } = setup();
    bm.setActiveSpace('s-work');
    const t = bm.createTab('https://x.example.com/');
    expect(t.spaceId).toBe('s-work');
    expect(t.section).toBe('today');
    expect(t.isPinned).toBe(false);
  });

  it('records history in the owning profile only (R4.1)', () => {
    const { bm, historyRegistry } = setup();
    const w = bm.createTab('https://w.example.com/', 's-work');
    bm.updateTab(w.id, { url: 'https://w.example.com/next' });
    const workUrls = historyRegistry.for('work').getEntries().map((e) => e.url);
    expect(workUrls).toContain('https://w.example.com/next');
    expect(historyRegistry.for(DEFAULT_PROFILE_ID).getEntries()).toEqual([]);
  });

  it('activates the space\'s last active tab, or a new Today tab when empty (R13.6)', () => {
    const { bm, clock } = setup();
    const a1 = bm.createTab('https://a1.example.com/', 's-home');
    clock.t = 2000;
    const a2 = bm.createTab('https://a2.example.com/', 's-home');
    clock.t = 3000;
    bm.setActiveTab(a1.id);
    clock.t = 4000;
    bm.setActiveSpace('s-work');
    const created = bm.getActiveTab()!;
    expect(created.spaceId).toBe('s-work');
    expect(created.url).toBe('neutrino://newtab');
    clock.t = 5000;
    bm.setActiveSpace('s-home');
    expect(bm.getActiveTab()!.id).toBe(a1.id);
    expect(bm.getActiveTab()!.lastActiveAt).toBe(5000);
    expect(bm.getTabs().find((t) => t.id === a2.id)!.lastActiveAt).toBe(3000);
  });

  it('persists pinned and Today tabs and restores them asleep/unloaded (R15.2, R16.4)', () => {
    const clock = { t: 1000 };
    const first = setup(seedFile(), clock);
    const p = first.bm.createTab('https://pinned.example.com/', 's-home', true);
    const t = first.bm.createTab('https://today.example.com/', 's-home');
    first.bm.createTab('neutrino://newtab', 's-home');
    const saved = first.disk();
    expect(saved.tabs.map((e) => [e.id, e.section])).toEqual([
      [p.id, 'pinned'],
      [t.id, 'today'],
    ]);
    expect(saved.tabs.find((e) => e.id === t.id)!.lastActiveAt).toBe(1000);

    const second = setup(saved, clock);
    const restored = second.bm.getTabs();
    const rp = restored.find((x) => x.id === p.id)!;
    const rt = restored.find((x) => x.id === t.id)!;
    expect(rp).toMatchObject({ section: 'pinned', isPinned: true, unloaded: true, isSleeping: true, url: 'https://pinned.example.com/' });
    expect(rt).toMatchObject({ section: 'today', isSleeping: true, url: 'https://today.example.com/' });
    expect(rt.unloaded).toBeUndefined();

    clock.t = 9000;
    second.bm.setActiveTab(rp.id);
    expect(rp.unloaded).toBe(false);
    expect(rp.isSleeping).toBe(false);
    expect(second.disk().tabs.find((e) => e.id === p.id)).toMatchObject({ lastActiveAt: 9000 });
    expect(second.disk().tabs.find((e) => e.id === p.id)!.unloaded).toBeUndefined();
  });

  it('closing a pinned tab unloads it and keeps the entry; closing a Today tab removes it (R15.3, R12.9)', () => {
    const { bm, disk } = setup();
    const p = bm.createTab('https://pinned.example.com/', 's-home', true);
    const t = bm.createTab('https://today.example.com/', 's-home');
    bm.closeTab(p.id);
    expect(bm.getTabs().find((x) => x.id === p.id)).toMatchObject({ unloaded: true, isSleeping: true });
    expect(disk().tabs.find((e) => e.id === p.id)).toMatchObject({ unloaded: true });
    bm.closeTab(t.id);
    expect(bm.getTabs().some((x) => x.id === t.id)).toBe(false);
    expect(disk().tabs.some((e) => e.id === t.id)).toBe(false);
    const reopened = bm.reopenLastClosedTab()!;
    expect(reopened.url).toBe('https://today.example.com/');
  });

  it('togglePinTab moves between sections and persists (R15.1, R15.5)', () => {
    const { bm, disk } = setup();
    const t = bm.createTab('https://x.example.com/', 's-home');
    bm.togglePinTab(t.id);
    expect(bm.getTabs().find((x) => x.id === t.id)).toMatchObject({ section: 'pinned', isPinned: true });
    expect(disk().tabs.find((e) => e.id === t.id)!.section).toBe('pinned');
    bm.togglePinTab(t.id);
    expect(disk().tabs.find((e) => e.id === t.id)!.section).toBe('today');
  });

  it('reloads only on a cross-profile move (R17.4, R17.5, R1.12)', () => {
    const { bm, sent } = setup();
    const t = bm.createTab('https://x.example.com/', 's-home');
    const reloads = () => sent.filter((s) => s.channel === 'neutrino:tab-partition-changed');

    expect(bm.moveTab({ type: 'space', id: t.id, from: 'today', targetSpaceId: 's-read' })).toBe(false);
    expect(bm.getTabs().find((x) => x.id === t.id)).toMatchObject({ spaceId: 's-read', partition: DEFAULT_PARTITION });
    expect(reloads()).toHaveLength(0);

    expect(bm.moveTab({ type: 'space', id: t.id, from: 'today', targetSpaceId: 's-work' })).toBe(true);
    expect(bm.getTabs().find((x) => x.id === t.id)).toMatchObject({ spaceId: 's-work', partition: 'persist:profile-work' });
    expect(reloads().map((r) => r.payload)).toEqual([
      { tabId: t.id, partition: 'persist:profile-work', url: 'https://x.example.com/' },
    ]);
  });

  it('ignores renderer attempts to change partition, space or section through updateTab', () => {
    const { bm } = setup();
    const t = bm.createTab('https://x.example.com/', 's-home');
    bm.updateTab(t.id, { partition: 'persist:profile-work', spaceId: 's-work', section: 'pinned', title: 'X' } as any);
    expect(bm.getTabs().find((x) => x.id === t.id)).toMatchObject({
      partition: DEFAULT_PARTITION,
      spaceId: 's-home',
      section: 'today',
      title: 'X',
    });
  });

  it('keeps spaces in the ProfileStore and exports them from it', () => {
    const { bm, store } = setup();
    const created = bm.createSpace('New', '#abcdef');
    expect(store.listSpaces().find((s) => s.id === created.id)).toMatchObject({ name: 'New', color: '#abcdef', profileId: DEFAULT_PROFILE_ID });
    expect(bm.getActiveSpaceId()).toBe(created.id);
    const p = bm.createTab('https://pinned.example.com/', 's-home', true);
    const pkg = JSON.parse(bm.exportSyncPackage());
    expect(pkg.spaces.map((s: any) => s.id)).toEqual(['s-home', 's-read', created.id, 's-work']);
    expect(pkg.pinnedTabs.map((x: any) => x.id)).toEqual([p.id]);

    bm.deleteSpace('s-work'); // only space of profile "work": rejected
    expect(store.listSpaces().some((s) => s.id === 's-work')).toBe(true);
    bm.deleteSpace(created.id);
    expect(store.listSpaces().some((s) => s.id === created.id)).toBe(false);
  });
});

describe('BrowserManager tab lifecycle -> PreviewService (R18.3, R18.5, R18.7)', () => {
  it('captures on deactivation, keeps previews on sleep/unload, deletes them on close and archive', async () => {
    const { PreviewService } = await import('../../../src/main/previews/service');
    const { bm } = setup();
    const captured: string[] = [];
    const removed: Array<[string, string]> = [];
    const previews = new PreviewService(async (tabId) => {
      captured.push(tabId);
      return `img:${tabId}`;
    }, () => 5000);
    const pending: Promise<boolean>[] = [];
    bm.setTabLifecycleListener({
      onDeactivated: (id) => { pending.push(previews.requestCapture(id, 'deactivation')); },
      onSleep: (id) => previews.onSleep(id),
      onWake: (id) => previews.onWake(id),
      onRemoved: (id, reason) => {
        removed.push([id, reason]);
        if (reason === 'archive') previews.onArchive(id);
        else previews.onClose(id);
      },
    });

    const today = bm.createTab('https://a.example.com/', 's-home');
    const pinned = bm.createTab('https://p.example.com/', 's-home', true); // deactivates `today`
    const other = bm.createTab('https://o.example.com/', 's-home'); // deactivates `pinned`
    const archived = bm.createTab('https://z.example.com/', 's-home'); // deactivates `other`
    bm.setActiveTab(other.id); // deactivates `archived`
    await Promise.all(pending);
    expect(captured).toEqual([today.id, pinned.id, other.id, archived.id]);

    // Zen sleep keeps the preview, and a sleeping tab is not captured again.
    bm.toggleSleepTab(today.id);
    expect(previews.get(today.id)?.image).toBe(`img:${today.id}`);
    expect(await previews.requestCapture(today.id, 'deactivation')).toBe(false);

    // Closing a pinned tab unloads it: preview kept.
    bm.closeTab(pinned.id);
    expect(previews.get(pinned.id)?.image).toBe(`img:${pinned.id}`);

    // Closing a Today tab deletes its preview.
    bm.closeTab(today.id);
    expect(previews.get(today.id)).toBeUndefined();

    // A tab removed into the archive is reported as archived and loses its preview.
    bm.applyLayout((file) => ({
      ...file,
      tabs: file.tabs.filter((t) => t.id !== archived.id),
      archive: [
        ...file.archive,
        { id: archived.id, profileId: DEFAULT_PROFILE_ID, spaceId: 's-home', url: 'https://z.example.com/', title: 'Z', archivedAt: 5000 },
      ],
    }));
    expect(removed).toEqual([[today.id, 'close'], [archived.id, 'archive']]);
    expect(previews.get(archived.id)).toBeUndefined();
    expect(previews.get(other.id)?.image).toBe(`img:${other.id}`);
  });

  it('a throwing listener does not break tab handling', () => {
    const { bm } = setup();
    bm.setTabLifecycleListener({ onDeactivated: () => { throw new Error('boom'); } });
    const a = bm.createTab('https://a.example.com/', 's-home');
    const b = bm.createTab('https://b.example.com/', 's-home');
    expect(bm.getActiveTab()?.id).toBe(b.id);
    bm.setActiveTab(a.id);
    expect(bm.getActiveTab()?.id).toBe(a.id);
  });
});
