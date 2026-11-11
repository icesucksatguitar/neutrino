// Unit tests for the index.ts wiring helpers (task 8.10): ProfileStore I/O
// over the migration result, IPC input validation and opener resolution.
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runMigrationOnce, createFsMigrationIO, type MigrationResult } from '../../../src/main/profiles/migration';
import { ProfileStore } from '../../../src/main/profiles/store';
import { createProfileStoreIO, type ClearableSession } from '../../../src/main/profiles/storeIO';
import {
  asId,
  asIndex,
  asName,
  parseMoveOp,
  parseSpacePatch,
  resolveOpener,
  type OpenerTab,
} from '../../../src/main/profiles/ipcInput';
import { decideWindowOpen } from '../../../src/main/windowOpen';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'neutrino-wiring-'));
}

function fakeSessions() {
  const cleared: string[] = [];
  const fromPartition = (partition: string): ClearableSession => ({
    clearStorageData: async () => {
      cleared.push(`storage:${partition}`);
    },
    clearCache: async () => {
      cleared.push(`cache:${partition}`);
    },
  });
  return { cleared, fromPartition };
}

describe('createProfileStoreIO', () => {
  it('migrates legacy spaces into Default on persist:neutrino and persists profiles.json', () => {
    const dir = tmpDir();
    const legacy = JSON.stringify({
      spaces: [{ id: 'space-x', name: 'X', icon: 'Star', color: '#111' }],
      settings: { pinnedSites: [{ url: 'https://a.com' }] },
    });
    fs.writeFileSync(path.join(dir, 'browser-state.json'), legacy);

    const migration = runMigrationOnce(createFsMigrationIO(dir));
    expect(migration.status).toBe('migrated');
    const { fromPartition } = fakeSessions();
    const store = new ProfileStore(createProfileStoreIO({ dataDir: dir, migration, fromPartition, removeHistory: () => {} }));

    expect(store.listProfiles().map((p) => p.id)).toEqual(['default']);
    expect(store.partitionForSpace('space-x')).toBe('persist:neutrino');
    expect(fs.readFileSync(path.join(dir, 'browser-state.json'), 'utf-8')).toBe(legacy);

    // Second start: migration skips and the store reads the written file.
    store.createProfile('Work');
    const again = runMigrationOnce(createFsMigrationIO(dir));
    expect(again.status).toBe('skipped');
    const reloaded = new ProfileStore(createProfileStoreIO({ dataDir: dir, migration: again, fromPartition, removeHistory: () => {} }));
    expect(reloaded.listProfiles().map((p) => p.name)).toEqual(['Default', 'Work']);
  });

  it('writes nothing after a failed migration (runtime-only Default)', () => {
    const dir = tmpDir();
    const failed: MigrationResult = {
      status: 'failed',
      profiles: {
        schemaVersion: 1,
        profiles: [{ id: 'default', name: 'Default', createdAt: 1 }],
        spaces: [{ id: 'space-study', profileId: 'default', name: 'Study', icon: '', color: '', order: 0 }],
        tabs: [],
        favorites: [],
        archive: [],
        neverList: {},
      },
      partition: 'persist:neutrino',
      error: new Error('boom'),
    };
    const { fromPartition } = fakeSessions();
    const store = new ProfileStore(createProfileStoreIO({ dataDir: dir, migration: failed, fromPartition, removeHistory: () => {} }));
    store.createSpace('More');
    expect(store.partitionForSpace('space-study')).toBe('persist:neutrino');
    expect(fs.existsSync(path.join(dir, 'profiles.json'))).toBe(false);
  });

  it('profile deletion clears that session and removes only its history and vault files', async () => {
    const dir = tmpDir();
    const migration = runMigrationOnce(createFsMigrationIO(dir));
    const { cleared, fromPartition } = fakeSessions();
    const removedHistory: string[] = [];
    const store = new ProfileStore(
      createProfileStoreIO({ dataDir: dir, migration, fromPartition, removeHistory: (id) => removedHistory.push(id) }),
    );
    const { profile } = store.createProfile('Work');
    fs.writeFileSync(path.join(dir, `vault-${profile.id}.json`), '{}');
    fs.writeFileSync(path.join(dir, 'vault-default.json'), '{}');

    await store.deleteProfile(profile.id);

    const partition = `persist:profile-${profile.id}`;
    expect(cleared).toEqual([`storage:${partition}`, `cache:${partition}`]);
    expect(removedHistory).toEqual([profile.id]);
    expect(fs.existsSync(path.join(dir, `vault-${profile.id}.json`))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'vault-default.json'))).toBe(true);
    await expect(store.deleteProfile('default')).rejects.toThrow(/last profile/);
  });
});

describe('IPC input validation', () => {
  it('accepts plain ids and names, rejects other values', () => {
    expect(asId('space-1')).toBe('space-1');
    for (const bad of ['', 1, null, undefined, {}, 'a\u0000b', 'x'.repeat(201)]) expect(asId(bad)).toBeNull();
    expect(asName('  Work ')).toBe('Work');
    for (const bad of ['   ', 7, 'x'.repeat(101)]) expect(asName(bad)).toBeNull();
    expect(asIndex(0)).toBe(0);
    for (const bad of [-1, 1.5, NaN, '2']) expect(asIndex(bad)).toBeNull();
  });

  it('parses move ops and rejects unknown spaces or sections', () => {
    const known = (id: string) => id === 's1';
    expect(parseMoveOp({ type: 'reorder', section: 'today', id: 't1', toIndex: 2 }, known)).toEqual({
      type: 'reorder',
      section: 'today',
      id: 't1',
      toIndex: 2,
    });
    expect(parseMoveOp({ type: 'section', id: 't1', from: 'today', to: 'favorite', spaceId: 's1' }, known)).toEqual({
      type: 'section',
      id: 't1',
      from: 'today',
      to: 'favorite',
      spaceId: 's1',
    });
    expect(parseMoveOp({ type: 'space', id: 't1', from: 'pinned', targetSpaceId: 's1' }, known)).toEqual({
      type: 'space',
      id: 't1',
      from: 'pinned',
      targetSpaceId: 's1',
    });
    expect(parseMoveOp({ type: 'space', id: 't1', from: 'pinned', targetSpaceId: 's2' }, known)).toBeNull();
    expect(parseMoveOp({ type: 'section', id: 't1', from: 'today', to: 'nowhere', spaceId: 's1' }, known)).toBeNull();
    expect(parseMoveOp({ type: 'reorder', section: 'today', id: 't1', toIndex: -1 }, known)).toBeNull();
    expect(parseMoveOp('move', known)).toBeNull();
  });

  it('parses space patches without accepting order', () => {
    expect(parseSpacePatch({ name: ' Docs ', color: '#fff', order: 3 })).toEqual({ name: 'Docs', color: '#fff' });
    expect(parseSpacePatch({ name: '' })).toBeNull();
    expect(parseSpacePatch({ order: 1 })).toBeNull();
  });
});

describe('resolveOpener', () => {
  const tabs: OpenerTab[] = [
    { id: 'a', spaceId: 'home', partition: 'persist:neutrino', url: 'https://a.com/' },
    { id: 'b', spaceId: 'work', partition: 'persist:profile-w', url: 'https://b.com/' },
  ];
  const spaceForPartition = (p: string) => (p === 'persist:profile-w' ? 'work' : p === 'persist:neutrino' ? 'home' : null);

  it('uses the opener session partition and the tab showing the opener URL', () => {
    const ctx = resolveOpener({
      tabs,
      activeTab: tabs[0],
      sessionPartition: 'persist:profile-w',
      openerUrl: 'https://b.com/',
      spaceForPartition,
    });
    expect(ctx).toEqual({ partition: 'persist:profile-w', activeTab: tabs[1] });

    // Fed to decideWindowOpen: popups open in the opener profile, links in its space.
    const popup = decideWindowOpen(
      { url: 'https://accounts.google.com/x', disposition: 'foreground-tab', features: '' },
      { isAuthOrSecurityUrl: (u) => u.includes('accounts.google.com'), mainWindow: null, ...ctx },
    );
    expect(popup.action === 'allow' && popup.overrideBrowserWindowOptions.webPreferences.partition).toBe(
      'persist:profile-w',
    );
    const link = decideWindowOpen(
      { url: 'https://c.com/', disposition: 'foreground-tab', features: '' },
      { isAuthOrSecurityUrl: () => false, mainWindow: null, ...ctx },
    );
    expect(link).toEqual({ action: 'deny', createTab: { url: 'https://c.com/', spaceId: 'work' } });
  });

  it('falls back to the profile first space when no tab in that session matches', () => {
    const ctx = resolveOpener({
      tabs,
      activeTab: tabs[0],
      sessionPartition: 'persist:profile-w',
      openerUrl: 'https://popup.example/',
      spaceForPartition,
    });
    expect(ctx).toEqual({ partition: 'persist:profile-w', activeTab: { spaceId: 'work' } });
  });

  it('uses the active tab profile for unknown sessions (browser UI)', () => {
    const ctx = resolveOpener({
      tabs,
      activeTab: tabs[1],
      sessionPartition: null,
      openerUrl: 'file:///index.html',
      spaceForPartition,
    });
    expect(ctx).toEqual({ partition: 'persist:profile-w', activeTab: tabs[1] });
    expect(
      resolveOpener({ tabs: [], activeTab: null, sessionPartition: null, openerUrl: '', spaceForPartition }),
    ).toEqual({ partition: undefined, activeTab: null });
  });
});
