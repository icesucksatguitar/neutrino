import { describe, it, expect } from 'vitest';
import {
  selectTabsToArchive,
  intervalToMs,
  restore,
  prune,
  listArchive,
  ARCHIVE_RETENTION_MS,
} from '../../../src/main/archive/archiver';
import type { ArchivedTab, ProfilesFile, TabEntry } from '../../../src/main/profiles/types';

const HOUR = 60 * 60 * 1000;
const NOW = 1_000_000_000_000;

function tab(id: string, over: Partial<TabEntry> = {}): TabEntry {
  return { id, spaceId: 's1', section: 'today', url: `https://${id}.test/`, title: id, order: 0, lastActiveAt: NOW, ...over };
}

function archived(id: string, over: Partial<ArchivedTab> = {}): ArchivedTab {
  return { id, profileId: 'p1', spaceId: 's1', url: `https://${id}.test/`, title: id, archivedAt: NOW, ...over };
}

function file(over: Partial<ProfilesFile> = {}): ProfilesFile {
  return {
    schemaVersion: 1,
    profiles: [{ id: 'p1', name: 'One', createdAt: 0 }, { id: 'p2', name: 'Two', createdAt: 0 }],
    spaces: [
      { id: 's1', profileId: 'p1', name: 'S1', icon: '', color: '', order: 0 },
      { id: 's2', profileId: 'p1', name: 'S2', icon: '', color: '', order: 1 },
      { id: 's3', profileId: 'p2', name: 'S3', icon: '', color: '', order: 0 },
    ],
    tabs: [],
    favorites: [],
    archive: [],
    neverList: {},
    ...over,
  };
}

describe('intervalToMs', () => {
  it('converts hours and maps never to null', () => {
    expect(intervalToMs(12)).toBe(12 * HOUR);
    expect(intervalToMs(720)).toBe(720 * HOUR);
    expect(intervalToMs('never')).toBeNull();
  });
});

describe('selectTabsToArchive', () => {
  const ctx = { now: NOW, intervalMs: 12 * HOUR, activeTabId: null, audioTabIds: new Set<string>() };

  it('selects today tabs inactive longer than the interval, strictly', () => {
    const old = tab('old', { lastActiveAt: NOW - 13 * HOUR });
    const exact = tab('exact', { lastActiveAt: NOW - 12 * HOUR });
    const fresh = tab('fresh', { lastActiveAt: NOW - HOUR });
    expect(selectTabsToArchive([old, exact, fresh], ctx)).toEqual([old]);
  });

  it('excludes pinned, active and audio tabs', () => {
    const stale = NOW - 100 * HOUR;
    const tabs = [
      tab('pinned', { section: 'pinned', lastActiveAt: stale }),
      tab('active', { lastActiveAt: stale }),
      tab('audio', { lastActiveAt: stale }),
      tab('target', { lastActiveAt: stale }),
    ];
    const picked = selectTabsToArchive(tabs, { ...ctx, activeTabId: 'active', audioTabIds: new Set(['audio']) });
    expect(picked.map((t) => t.id)).toEqual(['target']);
  });

  it('selects nothing when the interval is never', () => {
    expect(selectTabsToArchive([tab('a', { lastActiveAt: 0 })], { ...ctx, intervalMs: null })).toEqual([]);
  });
});

describe('prune', () => {
  it('keeps entries within 30 days, drops older, and is idempotent', () => {
    const keepEdge = archived('edge', { archivedAt: NOW - ARCHIVE_RETENTION_MS });
    const drop = archived('drop', { archivedAt: NOW - ARCHIVE_RETENTION_MS - 1 });
    const recent = archived('recent', { archivedAt: NOW - HOUR });
    const once = prune([keepEdge, drop, recent], NOW);
    expect(once).toEqual([keepEdge, recent]);
    expect(prune(once, NOW)).toEqual(once);
  });
});

describe('listArchive', () => {
  it('returns only the profile entries, newest first', () => {
    const f = file({
      archive: [
        archived('a', { archivedAt: NOW - 3 }),
        archived('b', { archivedAt: NOW - 1 }),
        archived('other', { profileId: 'p2', spaceId: 's3', archivedAt: NOW }),
        archived('c', { archivedAt: NOW - 2 }),
      ],
    });
    expect(listArchive(f, 'p1').map((e) => e.id)).toEqual(['b', 'c', 'a']);
    expect(listArchive(f, 'p2').map((e) => e.id)).toEqual(['other']);
  });
});

describe('restore', () => {
  const newId = () => 'new-tab';

  it('reopens into the original space as a Today tab and removes the entry', () => {
    const f = file({
      tabs: [tab('t1', { spaceId: 's2', order: 4 }), tab('p', { spaceId: 's2', section: 'pinned', order: 9 })],
      archive: [archived('x', { spaceId: 's2', favicon: 'fav.ico' }), archived('y')],
    });
    const result = restore(f, 'x', 's1', NOW + 5, newId);
    expect(result).not.toBeNull();
    expect(result!.tab).toEqual({
      id: 'new-tab', spaceId: 's2', section: 'today', url: 'https://x.test/', title: 'x',
      favicon: 'fav.ico', order: 5, lastActiveAt: NOW + 5,
    });
    expect(result!.file.archive.map((a) => a.id)).toEqual(['y']);
    expect(result!.file.tabs).toContainEqual(result!.tab);
    // Input is not mutated.
    expect(f.archive).toHaveLength(2);
    expect(f.tabs).toHaveLength(2);
  });

  it('falls back to the active space when the original space is gone', () => {
    const f = file({ archive: [archived('x', { spaceId: 'deleted' })] });
    const result = restore(f, 'x', 's1', NOW, newId);
    expect(result!.tab.spaceId).toBe('s1');
    expect(result!.tab.order).toBe(0);
    expect(result!.file.archive).toEqual([]);
  });

  it('returns null for an unknown entry or when no target space exists', () => {
    const f = file({ archive: [archived('x', { spaceId: 'deleted' })] });
    expect(restore(f, 'missing', 's1', NOW, newId)).toBeNull();
    expect(restore(f, 'x', null, NOW, newId)).toBeNull();
    expect(restore(f, 'x', 'nope', NOW, newId)).toBeNull();
  });

  it('generates an id by default', () => {
    const f = file({ archive: [archived('x')] });
    expect(restore(f, 'x', 's1', NOW)!.tab.id).toMatch(/\S+/);
  });
});
