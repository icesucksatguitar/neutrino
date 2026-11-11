// Feature: arc-spaces-profiles-redesign, task 12.2: archive scheduler decisions (R16.3-R16.9).
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  activeSpaceOfProfile,
  archiveListView,
  isArchiveDue,
  planArchive,
  pruneFile,
  restoreArchived,
  toArchivedTab,
} from '../../../src/main/archive/scheduler';
import { ARCHIVE_RETENTION_MS, selectTabsToArchive } from '../../../src/main/archive/archiver';
import type { ArchivedTab, ProfilesFile, TabEntry } from '../../../src/main/profiles/types';

const HOUR = 60 * 60 * 1000;
const NOW = 1_000_000_000_000;
const ctx = (over: Partial<Parameters<typeof planArchive>[1]> = {}) => ({
  now: NOW,
  intervalMs: 12 * HOUR,
  activeTabId: null,
  audioTabIds: new Set<string>(),
  ...over,
});

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
      { id: 's3', profileId: 'p2', name: 'S3', icon: '', color: '', order: 1 },
      { id: 's4', profileId: 'p2', name: 'S4', icon: '', color: '', order: 0 },
    ],
    tabs: [],
    favorites: [],
    archive: [],
    neverList: {},
    ...over,
  };
}

describe('toArchivedTab', () => {
  it('keeps the tab id, url, title, favicon and records profile and time', () => {
    const entry = toArchivedTab(tab('a', { favicon: 'f.ico', spaceId: 's3' }), 'p2', NOW);
    expect(entry).toEqual({ id: 'a', profileId: 'p2', spaceId: 's3', url: 'https://a.test/', title: 'a', favicon: 'f.ico', archivedAt: NOW });
    expect('favicon' in toArchivedTab(tab('b'), 'p1', NOW)).toBe(false);
  });
});

describe('planArchive', () => {
  it('returns null when nothing is due', () => {
    expect(planArchive(file({ tabs: [tab('a')] }), ctx())).toBeNull();
    expect(planArchive(file({ tabs: [tab('a', { lastActiveAt: 0 })] }), ctx({ intervalMs: null }))).toBeNull();
  });

  it('closes due tabs, records them under the owning profile, keeps the rest', () => {
    const old = NOW - 13 * HOUR;
    const f = file({
      tabs: [
        tab('due', { lastActiveAt: old, spaceId: 's3' }),
        tab('fresh'),
        tab('pinned', { section: 'pinned', lastActiveAt: old }),
        tab('active', { lastActiveAt: old }),
        tab('audio', { lastActiveAt: old }),
      ],
    });
    const plan = planArchive(f, ctx({ activeTabId: 'active', audioTabIds: new Set(['audio']) }))!;
    expect(plan.closedIds).toEqual(['due']);
    expect(plan.archivedIds).toEqual(['due']);
    expect(plan.file.tabs.map((t) => t.id)).toEqual(['fresh', 'pinned', 'active', 'audio']);
    expect(plan.file.archive).toEqual([toArchivedTab(f.tabs[0], 'p2', NOW)]);
  });

  it('closes blank tabs without an archive entry and prunes expired entries', () => {
    const f = file({
      tabs: [tab('blank', { url: 'neutrino://newtab', lastActiveAt: 0 })],
      archive: [archived('expired', { archivedAt: NOW - ARCHIVE_RETENTION_MS - 1 }), archived('kept')],
    });
    const plan = planArchive(f, ctx())!;
    expect(plan.closedIds).toEqual(['blank']);
    expect(plan.archivedIds).toEqual([]);
    expect(plan.file.tabs).toEqual([]);
    expect(plan.file.archive.map((a) => a.id)).toEqual(['kept']);
  });

  it('closes exactly the selected tabs and records each non-blank one once (property)', () => {
    const tabArb = fc.record({
      id: fc.string({ minLength: 1, maxLength: 4 }),
      spaceId: fc.constantFrom('s1', 's2', 's3'),
      section: fc.constantFrom<'today' | 'pinned'>('today', 'pinned'),
      url: fc.constantFrom('https://x.test/', 'neutrino://newtab', 'about:blank', 'https://y.test/'),
      age: fc.integer({ min: 0, max: 48 }),
    });
    fc.assert(
      fc.property(fc.uniqueArray(tabArb, { selector: (t) => t.id, maxLength: 12 }), fc.boolean(), (raw, withActive) => {
        const tabs = raw.map((t, i) => tab(t.id, { spaceId: t.spaceId, section: t.section, url: t.url, order: i, lastActiveAt: NOW - t.age * HOUR }));
        const c = ctx({ activeTabId: withActive && tabs[0] ? tabs[0].id : null });
        const f = file({ tabs });
        const plan = planArchive(f, c);
        const due = selectTabsToArchive(tabs, c).map((t) => t.id);
        expect(isArchiveDue(tabs, c)).toBe(due.length > 0);
        if (due.length === 0) {
          expect(plan).toBeNull();
          return;
        }
        expect(plan!.closedIds).toEqual(due);
        expect(plan!.file.tabs.map((t) => t.id)).toEqual(tabs.filter((t) => !due.includes(t.id)).map((t) => t.id));
        const expected = tabs.filter((t) => due.includes(t.id) && t.url.startsWith('https://')).map((t) => t.id);
        expect(plan!.file.archive.map((a) => a.id)).toEqual(expected);
      }),
      { numRuns: 100 },
    );
  });
});

describe('pruneFile', () => {
  it('returns null when nothing expired, otherwise the pruned file', () => {
    expect(pruneFile(file({ archive: [archived('a')] }), NOW)).toBeNull();
    const pruned = pruneFile(file({ archive: [archived('a'), archived('old', { archivedAt: NOW - ARCHIVE_RETENTION_MS - 1 })] }), NOW);
    expect(pruned!.archive.map((a) => a.id)).toEqual(['a']);
  });
});

describe('activeSpaceOfProfile', () => {
  it('uses the active space when the profile owns it, else the profile first space by order', () => {
    const f = file();
    expect(activeSpaceOfProfile(f, 'p1', 's2')).toBe('s2');
    expect(activeSpaceOfProfile(f, 'p2', 's2')).toBe('s4');
    expect(activeSpaceOfProfile(f, 'p2', null)).toBe('s4');
    expect(activeSpaceOfProfile(f, 'missing', 's1')).toBeNull();
  });
});

describe('restoreArchived', () => {
  const newId = () => 'new';

  it('restores into the original space and removes the entry', () => {
    const r = restoreArchived(file({ archive: [archived('a', { spaceId: 's2' })] }), 'a', 's1', NOW, newId)!;
    expect(r.tab).toMatchObject({ id: 'new', spaceId: 's2', section: 'today', url: 'https://a.test/' });
    expect(r.file.archive).toEqual([]);
  });

  it('falls back to the active space of the entry own profile, never another profile', () => {
    const f = file({ archive: [archived('a', { profileId: 'p2', spaceId: 'gone' })] });
    // Active space s1 belongs to p1: the p2 tab goes to p2's first space.
    expect(restoreArchived(f, 'a', 's1', NOW, newId)!.tab.spaceId).toBe('s4');
    expect(restoreArchived(f, 'a', 's3', NOW, newId)!.tab.spaceId).toBe('s3');
  });

  it('returns null for an unknown entry', () => {
    expect(restoreArchived(file(), 'nope', 's1', NOW, newId)).toBeNull();
  });
});

describe('archiveListView', () => {
  it('lists only the profile entries, newest first, with space names', () => {
    const f = file({
      archive: [
        archived('old', { archivedAt: NOW - 2 }),
        archived('other', { profileId: 'p2', spaceId: 's3' }),
        archived('new', { archivedAt: NOW, spaceId: 'gone' }),
      ],
    });
    const view = archiveListView(f, 'p1');
    expect(view.map((e) => [e.id, e.spaceName])).toEqual([['new', null], ['old', 'S1']]);
  });
});
