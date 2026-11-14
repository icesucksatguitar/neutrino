import { describe, expect, it } from 'vitest';
import {
  ProfileStore,
  parseProfilesFile,
  serializeProfilesFile,
  type ProfileStoreIO,
} from '../../../src/main/profiles/store';
import { CURRENT_SCHEMA_VERSION, type ProfilesFile } from '../../../src/main/profiles/types';
import { buildSidebarView, toProfilesFile, type SidebarSource } from '../../../src/renderer/utils/sidebarModel';
import type { TabState } from '../../../src/renderer/types';

function fixtureFile(): ProfilesFile {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    profiles: [{ id: 'default', name: 'Default', createdAt: 1 }],
    spaces: [
      { id: 'space-study', profileId: 'default', name: 'Study', icon: 'BookOpen', color: '#E4E4E7', order: 0 },
      { id: 'space-work', profileId: 'default', name: 'Work', icon: 'Briefcase', color: '#A1A1AA', order: 1 },
    ],
    folders: [
      { id: 'fld-1', spaceId: 'space-study', name: 'Docs', order: 0, collapsed: false },
    ],
    tabs: [
      { id: 't1', spaceId: 'space-study', section: 'pinned', url: 'https://docs.test', title: 'Docs', order: 0, lastActiveAt: 1, folderId: 'fld-1' },
      { id: 't2', spaceId: 'space-study', section: 'pinned', url: 'https://notes.test', title: 'Notes', order: 1, lastActiveAt: 2 },
    ],
    favorites: [],
    archive: [],
    neverList: {},
  };
}

function fakeIO(initial: ProfilesFile | null) {
  let n = 0;
  const log = {
    writes: [] as ProfilesFile[],
    cleared: [] as string[],
    removed: [] as string[],
  };
  const io: ProfileStoreIO = {
    read: () => initial,
    write: (f) => { log.writes.push(f); },
    clearSession: async (p) => { log.cleared.push(p); },
    rmFiles: (id) => { log.removed.push(id); },
    newId: () => `id${++n}`,
    now: () => 1000,
  };
  return { io, log, last: () => log.writes[log.writes.length - 1] };
}

describe('Persistent Folders in ProfileStore', () => {
  it('creates a new folder in a space and persists it', () => {
    const { io, last } = fakeIO(fixtureFile());
    const store = new ProfileStore(io);

    const folder = store.createFolder('space-study', 'Reference');
    expect(folder.id).toBeDefined();
    expect(folder.spaceId).toBe('space-study');
    expect(folder.name).toBe('Reference');
    expect(folder.collapsed).toBe(false);

    const folders = store.listFolders('space-study');
    expect(folders.map((f) => f.name)).toEqual(['Docs', 'Reference']);
    expect(last().folders?.map((f) => f.name)).toContain('Reference');
  });

  it('updates folder attributes (name, collapsed, order)', () => {
    const { io, last } = fakeIO(fixtureFile());
    const store = new ProfileStore(io);

    const updated = store.updateFolder('fld-1', { name: 'Documentation', collapsed: true });
    expect(updated.name).toBe('Documentation');
    expect(updated.collapsed).toBe(true);

    const snapshot = store.snapshot();
    const folder = snapshot.folders?.find((f) => f.id === 'fld-1');
    expect(folder?.name).toBe('Documentation');
    expect(folder?.collapsed).toBe(true);
    expect(last().folders?.[0].collapsed).toBe(true);
  });

  it('deletes folder and unassigns contained tabs preserving them as root pinned tabs', () => {
    const { io, last } = fakeIO(fixtureFile());
    const store = new ProfileStore(io);

    expect(store.snapshot().tabs.find((t) => t.id === 't1')?.folderId).toBe('fld-1');

    const ok = store.deleteFolder('fld-1');
    expect(ok).toBe(true);

    const remainingFolders = store.listFolders('space-study');
    expect(remainingFolders).toHaveLength(0);

    const t1 = store.snapshot().tabs.find((t) => t.id === 't1');
    expect(t1).toBeDefined();
    expect(t1?.folderId).toBeUndefined();
    expect(t1?.section).toBe('pinned');
    expect(last().tabs.find((t) => t.id === 't1')?.folderId).toBeUndefined();
  });

  it('round-trips folders through serialization and parsing', () => {
    const file = fixtureFile();
    const serialized = serializeProfilesFile(file);
    const parsed = parseProfilesFile(serialized);

    expect(parsed).not.toBeNull();
    expect(parsed?.folders).toEqual(file.folders);
    expect(parsed?.tabs[0].folderId).toBe('fld-1');
  });

  it('deleting a space removes all folders in that space', () => {
    const { io } = fakeIO(fixtureFile());
    const store = new ProfileStore(io);

    expect(store.listFolders('space-study')).toHaveLength(1);
    store.deleteSpace('space-study');
    expect(store.listFolders('space-study')).toHaveLength(0);
  });
});

describe('Sidebar View Model with Folders', () => {
  it('builds sidebar view with folders for the active space', () => {
    const tabs: TabState[] = [
      {
        id: 't1',
        spaceId: 'space-study',
        title: 'Tab 1',
        url: 'https://1.test',
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
        isPinned: true,
        isSleeping: false,
        blockedCount: 0,
        folderId: 'fld-1',
      },
      {
        id: 't2',
        spaceId: 'space-study',
        title: 'Tab 2',
        url: 'https://2.test',
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
        isPinned: true,
        isSleeping: false,
        blockedCount: 0,
      },
    ];

    const source: SidebarSource = {
      spaces: [
        { id: 'space-study', name: 'Study', icon: 'BookOpen', color: '#E4E4E7' },
      ],
      activeSpaceId: 'space-study',
      activeTabId: 't1',
      tabs,
      folders: [
        { id: 'fld-1', spaceId: 'space-study', name: 'Work Folder', order: 0, collapsed: false },
        { id: 'fld-other', spaceId: 'space-other', name: 'Other', order: 0, collapsed: false },
      ],
    };

    const view = buildSidebarView(source);
    expect(view.folders).toHaveLength(1);
    expect(view.folders[0].id).toBe('fld-1');
    expect(view.folders[0].name).toBe('Work Folder');

    expect(view.pinned).toHaveLength(2);
    expect(view.pinned[0].folderId).toBe('fld-1');
    expect(view.pinned[1].folderId).toBeUndefined();

    const file = toProfilesFile(source);
    expect(file.folders).toHaveLength(2);
    expect(file.tabs.find((t) => t.id === 't1')?.folderId).toBe('fld-1');
  });
});
