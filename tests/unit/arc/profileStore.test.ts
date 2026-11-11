import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import {
  ProfileStore,
  parseProfilesFile,
  serializeProfilesFile,
  type ProfileStoreIO,
} from '../../../src/main/profiles/store';
import { CURRENT_SCHEMA_VERSION, type ProfilesFile } from '../../../src/main/profiles/types';

function legacyFile(): ProfilesFile {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    migratedAt: 1,
    profiles: [{ id: 'default', name: 'Default', createdAt: 1 }],
    spaces: [
      { id: 'space-study', profileId: 'default', name: 'Study', icon: 'BookOpen', color: '#E4E4E7', order: 0 },
      { id: 'space-work', profileId: 'default', name: 'Work', icon: 'Briefcase', color: '#A1A1AA', order: 1 },
    ],
    tabs: [
      { id: 't1', spaceId: 'space-work', section: 'pinned', url: 'https://a.test', title: 'A', order: 0, lastActiveAt: 5, unloaded: true },
      { id: 't2', spaceId: 'space-study', section: 'today', url: 'https://b.test', title: 'B', favicon: 'f', order: 0, lastActiveAt: 6 },
    ],
    favorites: [{ id: 'f1', profileId: 'default', url: 'https://c.test', title: 'C', order: 0 }],
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

describe('ProfileStore', () => {
  it('bootstraps a Default profile with one space when nothing is stored', () => {
    const { io, last } = fakeIO(null);
    const store = new ProfileStore(io);
    expect(store.listProfiles().map((p) => p.id)).toEqual(['default']);
    expect(store.listSpaces()).toHaveLength(1);
    expect(store.activeProfileId()).toBe('default');
    expect(store.partitionForSpace(store.activeSpaceId())).toBe('persist:neutrino');
    expect(last().profiles).toHaveLength(1);
  });

  it('does not write on load when stored data is valid', () => {
    const { io, log } = fakeIO(legacyFile());
    new ProfileStore(io);
    expect(log.writes).toHaveLength(0);
  });

  it('createProfile creates the profile, one owned space, and persists', () => {
    const { io, last } = fakeIO(legacyFile());
    const store = new ProfileStore(io);
    const { profile, space } = store.createProfile('  Work  ');
    expect(profile.name).toBe('Work');
    expect(space.profileId).toBe(profile.id);
    expect(store.ownerOf(space.id)).toBe(profile.id);
    expect(store.partitionForSpace(space.id)).toBe(`persist:profile-${profile.id}`);
    expect(last().profiles.map((p) => p.id)).toEqual(['default', profile.id]);
    expect(last().spaces.filter((s) => s.profileId === profile.id)).toHaveLength(1);
  });

  it('renameProfile changes only the name', () => {
    const { io, last } = fakeIO(legacyFile());
    const store = new ProfileStore(io);
    const before = store.snapshot();
    store.renameProfile('default', 'Personal');
    const after = last();
    expect(after.profiles[0].name).toBe('Personal');
    expect({ ...after, profiles: [] }).toEqual({ ...before, profiles: [] });
    expect(store.partitionForSpace('space-study')).toBe('persist:neutrino');
  });

  it('deleteProfile rejects the last profile and leaves state unchanged', async () => {
    const { io, log } = fakeIO(legacyFile());
    const store = new ProfileStore(io);
    const before = store.snapshot();
    await expect(store.deleteProfile('default')).rejects.toThrow(/last profile/);
    expect(store.snapshot()).toEqual(before);
    expect(log.writes).toHaveLength(0);
    expect(log.cleared).toEqual([]);
    expect(log.removed).toEqual([]);
  });

  it('deleteProfile erases exactly that profile and clears its session and files', async () => {
    const { io, log, last } = fakeIO(legacyFile());
    const store = new ProfileStore(io);
    const { profile, space } = store.createProfile('Work');
    store.update((f) => ({
      ...f,
      tabs: [...f.tabs, { id: 'tw', spaceId: space.id, section: 'today', url: 'https://w.test', title: 'W', order: 0, lastActiveAt: 1 }],
      favorites: [...f.favorites, { id: 'fw', profileId: profile.id, url: 'https://w.test', title: 'W', order: 0 }],
      archive: [{ id: 'aw', profileId: profile.id, spaceId: space.id, url: 'u', title: 't', archivedAt: 1 }],
      neverList: { [profile.id]: ['https://w.test'], default: ['https://d.test'] },
    }));
    store.setActiveSpace(space.id);

    await store.deleteProfile(profile.id);

    expect(log.cleared).toEqual([`persist:profile-${profile.id}`]);
    expect(log.removed).toEqual([profile.id]);
    const f = last();
    const legacy = legacyFile();
    expect(f.profiles).toEqual(legacy.profiles);
    expect(f.spaces).toEqual(legacy.spaces);
    expect(f.tabs).toEqual(legacy.tabs);
    expect(f.favorites).toEqual(legacy.favorites);
    expect(f.archive).toEqual([]);
    expect(f.neverList).toEqual({ default: ['https://d.test'] });
    expect(store.activeProfileId()).toBe('default');
  });

  it('createSpace defaults to the active profile and honours an explicit profile', () => {
    const { io } = fakeIO(legacyFile());
    const store = new ProfileStore(io);
    const { profile, space: workHome } = store.createProfile('Work');
    expect(store.createSpace('Plain').profileId).toBe('default');
    store.setActiveSpace(workHome.id);
    expect(store.createSpace('Docs').profileId).toBe(profile.id);
    expect(store.createSpace('Mine', 'default').profileId).toBe('default');
    expect(() => store.createSpace('X', 'nope')).toThrow();
  });

  it('deleteSpace rejects the only space of a profile and removes the space tabs otherwise', () => {
    const { io, last } = fakeIO(legacyFile());
    const store = new ProfileStore(io);
    const { space } = store.createProfile('Work');
    expect(() => store.deleteSpace(space.id)).toThrow(/at least one space/);
    store.setActiveSpace('space-work');
    store.deleteSpace('space-work');
    expect(last().spaces.map((s) => s.id)).not.toContain('space-work');
    expect(last().tabs.map((t) => t.id)).toEqual(['t2']);
    expect(store.activeSpaceId()).toBe('space-study');
  });

  it('updateSpace renames, recolors, changes icon and reorders within the profile', () => {
    const { io, last } = fakeIO(legacyFile());
    const store = new ProfileStore(io);
    const extra = store.createSpace('Leisure');
    store.updateSpace('space-study', { name: 'Learn', color: '#000', icon: 'Book' });
    store.updateSpace(extra.id, { order: 0 });
    expect(store.listSpaces('default').map((s) => s.id)).toEqual([extra.id, 'space-study', 'space-work']);
    const study = last().spaces.find((s) => s.id === 'space-study')!;
    expect(study).toMatchObject({ name: 'Learn', color: '#000', icon: 'Book', order: 1 });
  });

  it('moveSpace changes the owner and partition and keeps each profile non-empty', () => {
    const { io } = fakeIO(legacyFile());
    const store = new ProfileStore(io);
    const { profile, space } = store.createProfile('Work');
    expect(() => store.moveSpace(space.id, 'default')).toThrow(/at least one space/);
    store.moveSpace('space-work', profile.id);
    expect(store.ownerOf('space-work')).toBe(profile.id);
    expect(store.partitionForSpace('space-work')).toBe(`persist:profile-${profile.id}`);
    expect(store.listSpaces(profile.id).map((s) => s.id)).toEqual([space.id, 'space-work']);
  });

  it('setActiveSpace switches the active profile and rejects unknown spaces', () => {
    const { io } = fakeIO(legacyFile());
    const store = new ProfileStore(io);
    const { profile, space } = store.createProfile('Work');
    store.setActiveSpace(space.id);
    expect(store.activeProfileId()).toBe(profile.id);
    expect(() => store.setActiveSpace('missing')).toThrow();
    expect(() => store.ownerOf('missing')).toThrow();
  });

  it('update rejects results that break invariants', () => {
    const { io } = fakeIO(legacyFile());
    const store = new ProfileStore(io);
    expect(() => store.update((f) => ({ ...f, spaces: [] }))).toThrow();
    expect(store.listSpaces()).toHaveLength(2);
  });

  it('returned snapshots do not alias store state', () => {
    const { io } = fakeIO(legacyFile());
    const store = new ProfileStore(io);
    store.snapshot().spaces[0].profileId = 'hacked';
    expect(store.ownerOf('space-study')).toBe('default');
  });
});

describe('serializeProfilesFile / parseProfilesFile', () => {
  it('round-trips a file including optional fields and order', () => {
    const file = legacyFile();
    expect(parseProfilesFile(serializeProfilesFile(file))).toStrictEqual(file);
  });

  it('returns null for invalid JSON or a missing profiles array', () => {
    expect(parseProfilesFile('{not json')).toBeNull();
    expect(parseProfilesFile('{"spaces":[]}')).toBeNull();
  });

  it('drops malformed records', () => {
    const parsed = parseProfilesFile(JSON.stringify({
      schemaVersion: 1,
      profiles: [{ id: 'default', name: 'Default', createdAt: 1 }, { id: 3 }],
      spaces: [{ id: 's' }],
      neverList: { default: ['https://a.test', 7] },
    }));
    expect(parsed?.profiles).toHaveLength(1);
    expect(parsed?.spaces).toEqual([]);
    expect(parsed?.neverList).toEqual({ default: ['https://a.test'] });
  });

  it('store module does not import electron', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../../src/main/profiles/store.ts'), 'utf8');
    expect(src).not.toMatch(/from\s+['"]electron['"]|require\(\s*['"]electron['"]\s*\)/);
  });
});
