import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import {
  activationTarget,
  addFavorite,
  beginDrag,
  cancelDrag,
  closeTab,
  duplicate,
  move,
  pin,
  removeFavorite,
  reorder,
  selectSpaceByIndex,
  sidebarVisibility,
  spaceSwitcherGroups,
  spaceSwitcherOrder,
  unpin,
  visibleTabsForSpace,
} from '../../../src/main/sidebar/layout';
import type { ProfilesFile, TabEntry } from '../../../src/main/profiles/types';

const tab = (id: string, spaceId: string, section: 'pinned' | 'today', order: number, lastActiveAt = 0): TabEntry => ({
  id,
  spaceId,
  section,
  url: `https://${id}.test/`,
  title: id,
  order,
  lastActiveAt,
});

function fixture(): ProfilesFile {
  return {
    schemaVersion: 1,
    // Listed out of creation order on purpose.
    profiles: [
      { id: 'work', name: 'Work', createdAt: 200 },
      { id: 'default', name: 'Default', createdAt: 100 },
    ],
    spaces: [
      { id: 's2', profileId: 'default', name: 'B', icon: 'b', color: '#000', order: 1 },
      { id: 's1', profileId: 'default', name: 'A', icon: 'a', color: '#000', order: 0 },
      { id: 'w1', profileId: 'work', name: 'W', icon: 'w', color: '#000', order: 0 },
    ],
    tabs: [
      tab('p1', 's1', 'pinned', 0),
      tab('p2', 's1', 'pinned', 1),
      tab('t2', 's1', 'today', 1),
      tab('t1', 's1', 'today', 0),
      tab('t3', 's1', 'today', 2),
      tab('x1', 's2', 'today', 0),
    ],
    favorites: [
      { id: 'f1', profileId: 'default', url: 'https://f1.test/', title: 'f1', order: 0 },
      { id: 'f2', profileId: 'default', url: 'https://f2.test/', title: 'f2', order: 1 },
      { id: 'wf', profileId: 'work', url: 'https://wf.test/', title: 'wf', order: 0 },
    ],
    archive: [],
    neverList: {},
  };
}

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe('visibleTabsForSpace', () => {
  it('returns the owning profile favorites and the space pinned/today, sorted', () => {
    const l = visibleTabsForSpace(fixture(), 's1');
    expect(ids(l.favorites)).toEqual(['f1', 'f2']);
    expect(ids(l.pinned)).toEqual(['p1', 'p2']);
    expect(ids(l.today)).toEqual(['t1', 't2', 't3']);
  });

  it('shares favorites across spaces of the same profile only', () => {
    const f = fixture();
    expect(ids(visibleTabsForSpace(f, 's2').favorites)).toEqual(['f1', 'f2']);
    expect(ids(visibleTabsForSpace(f, 'w1').favorites)).toEqual(['wf']);
  });

  it('returns an empty layout for an unknown space', () => {
    expect(visibleTabsForSpace(fixture(), 'nope')).toEqual({ favorites: [], pinned: [], today: [] });
  });
});

describe('reorder', () => {
  it('moves an element and leaves the input untouched', () => {
    const src = ['a', 'b', 'c', 'd'];
    expect(reorder(src, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(reorder(src, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(reorder(src, 1, 99)).toEqual(['a', 'c', 'd', 'b']);
    expect(src).toEqual(['a', 'b', 'c', 'd']);
  });

  it('ignores an out-of-range source index', () => {
    expect(reorder(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
  });
});

describe('move', () => {
  it('reorders within a section without reload and renumbers order', () => {
    const f = fixture();
    const r = move(f, { type: 'reorder', section: 'today', id: 't3', toIndex: 0 });
    expect(r.needsReload).toBe(false);
    const today = visibleTabsForSpace(r.file, 's1').today;
    expect(ids(today)).toEqual(['t3', 't1', 't2']);
    expect(today.map((t) => t.order)).toEqual([0, 1, 2]);
    // Input not mutated.
    expect(ids(visibleTabsForSpace(f, 's1').today)).toEqual(['t1', 't2', 't3']);
  });

  it('reorders favorites within a profile', () => {
    const r = move(fixture(), { type: 'reorder', section: 'favorite', id: 'f2', toIndex: 0 });
    expect(ids(visibleTabsForSpace(r.file, 's1').favorites)).toEqual(['f2', 'f1']);
  });

  it('moves today -> pinned at an index, changing kind', () => {
    const r = move(fixture(), { type: 'section', id: 't2', from: 'today', to: 'pinned', spaceId: 's1', toIndex: 1 });
    const l = visibleTabsForSpace(r.file, 's1');
    expect(ids(l.pinned)).toEqual(['p1', 't2', 'p2']);
    expect(ids(l.today)).toEqual(['t1', 't3']);
    expect(r.needsReload).toBe(false);
  });

  it('moves pinned -> favorite into the owning profile favorites', () => {
    const r = move(fixture(), { type: 'section', id: 'p1', from: 'pinned', to: 'favorite', spaceId: 's1' });
    const l = visibleTabsForSpace(r.file, 's1');
    expect(ids(l.favorites)).toEqual(['f1', 'f2', 'p1']);
    expect(r.file.favorites.find((x) => x.id === 'p1')?.profileId).toBe('default');
    expect(ids(l.pinned)).toEqual(['p2']);
  });

  it('moves favorite -> today', () => {
    const r = move(fixture(), { type: 'section', id: 'f1', from: 'favorite', to: 'today', spaceId: 's1', toIndex: 0 }, 42);
    const l = visibleTabsForSpace(r.file, 's1');
    expect(ids(l.favorites)).toEqual(['f2']);
    expect(ids(l.today)).toEqual(['f1', 't1', 't2', 't3']);
    expect(l.today[0]).toMatchObject({ section: 'today', spaceId: 's1', url: 'https://f1.test/', lastActiveAt: 42 });
  });

  it('drop on a same-profile space keeps the page loaded', () => {
    const r = move(fixture(), { type: 'space', id: 't1', from: 'today', targetSpaceId: 's2' });
    expect(r.needsReload).toBe(false);
    expect(ids(visibleTabsForSpace(r.file, 's2').today)).toEqual(['x1', 't1']);
    expect(ids(visibleTabsForSpace(r.file, 's1').today)).toEqual(['t2', 't3']);
  });

  it('drop of a pinned tab on a space lands in its pinned section', () => {
    const r = move(fixture(), { type: 'space', id: 'p2', from: 'pinned', targetSpaceId: 's2' });
    expect(ids(visibleTabsForSpace(r.file, 's2').pinned)).toEqual(['p2']);
  });

  it('drop on a different-profile space requires reload', () => {
    const r = move(fixture(), { type: 'space', id: 't1', from: 'today', targetSpaceId: 'w1' });
    expect(r.needsReload).toBe(true);
    expect(r.file.tabs.find((t) => t.id === 't1')?.spaceId).toBe('w1');
  });

  it('preserves the total set of ids', () => {
    const f = fixture();
    const all = (x: ProfilesFile) => [...ids(x.tabs), ...ids(x.favorites)].sort();
    const r = move(f, { type: 'section', id: 'wf', from: 'favorite', to: 'pinned', spaceId: 's1' });
    expect(r.needsReload).toBe(true);
    expect(all(r.file)).toEqual(all(f));
  });

  it('is a no-op for an unknown id, wrong section or unknown target space', () => {
    const f = fixture();
    expect(move(f, { type: 'reorder', section: 'today', id: 'nope', toIndex: 0 })).toEqual({ file: f, needsReload: false });
    expect(move(f, { type: 'space', id: 'p1', from: 'today', targetSpaceId: 's2' }).file).toBe(f);
    expect(move(f, { type: 'space', id: 't1', from: 'today', targetSpaceId: 'gone' }).file).toBe(f);
  });
});

describe('beginDrag / cancelDrag', () => {
  it('restores the layout from before the drag', () => {
    const f = fixture();
    const snap = beginDrag(f);
    let cur = move(f, { type: 'reorder', section: 'today', id: 't1', toIndex: 2 }).file;
    cur = move(cur, { type: 'space', id: 'p1', from: 'pinned', targetSpaceId: 'w1' }).file;
    expect(cur).not.toEqual(f);
    expect(cancelDrag(snap)).toEqual(f);
  });
});

describe('closeTab', () => {
  it('keeps a pinned tab entry marked unloaded', () => {
    const r = closeTab(fixture(), 'p1');
    expect(r.file.tabs.find((t) => t.id === 'p1')).toMatchObject({ section: 'pinned', unloaded: true });
    expect(r.reopen).toEqual([]);
  });

  it('removes a today tab and pushes it to the reopen list', () => {
    const prev = [tab('old', 's1', 'today', 0)];
    const r = closeTab(fixture(), 't2', prev);
    expect(r.file.tabs.some((t) => t.id === 't2')).toBe(false);
    expect(ids(r.reopen)).toEqual(['old', 't2']);
    expect(ids(visibleTabsForSpace(r.file, 's1').today)).toEqual(['t1', 't3']);
    expect(ids(prev)).toEqual(['old']);
  });
});

describe('context-menu actions', () => {
  it('pin and unpin move between sections of the same space', () => {
    const pinned = pin(fixture(), 't1');
    expect(ids(visibleTabsForSpace(pinned, 's1').pinned)).toEqual(['p1', 'p2', 't1']);
    const back = unpin(pinned, 't1');
    expect(ids(visibleTabsForSpace(back, 's1').today)).toEqual(['t2', 't3', 't1']);
  });

  it('addFavorite stores it in the owning profile; removeFavorite deletes it', () => {
    const added = addFavorite(fixture(), 'x1');
    expect(added.favorites.find((x) => x.id === 'x1')?.profileId).toBe('default');
    expect(ids(visibleTabsForSpace(added, 's1').favorites)).toEqual(['f1', 'f2', 'x1']);
    const removed = removeFavorite(added, 'f1');
    expect(ids(visibleTabsForSpace(removed, 's1').favorites)).toEqual(['f2', 'x1']);
    expect(ids(visibleTabsForSpace(removed, 'w1').favorites)).toEqual(['wf']);
  });

  it('duplicate inserts a Today copy after the original', () => {
    const d = duplicate(fixture(), 't1', 'copy', 7);
    expect(ids(visibleTabsForSpace(d, 's1').today)).toEqual(['t1', 'copy', 't2', 't3']);
    expect(d.tabs.find((t) => t.id === 'copy')).toMatchObject({ url: 'https://t1.test/', lastActiveAt: 7 });
  });

  it('duplicate of a favorite needs a target space and refuses id collisions', () => {
    const f = fixture();
    expect(duplicate(f, 'f1', 'copy')).toBe(f);
    expect(ids(visibleTabsForSpace(duplicate(f, 'f1', 'copy', 1, 's2'), 's2').today)).toEqual(['x1', 'copy']);
    expect(duplicate(f, 't1', 't2')).toBe(f);
  });
});

describe('space switcher', () => {
  it('groups by profile creation order and sorts spaces by order', () => {
    const f = fixture();
    expect(spaceSwitcherGroups(f).map((g) => [g.profile.id, ids(g.spaces)])).toEqual([
      ['default', ['s1', 's2']],
      ['work', ['w1']],
    ]);
    expect(ids(spaceSwitcherOrder(f))).toEqual(['s1', 's2', 'w1']);
  });

  it('selectSpaceByIndex picks the Nth space or keeps the current one', () => {
    const order = spaceSwitcherOrder(fixture());
    expect(selectSpaceByIndex(order, 1, 'w1')).toBe('s1');
    expect(selectSpaceByIndex(order, 3, 's1')).toBe('w1');
    expect(selectSpaceByIndex(order, 4, 's2')).toBe('s2');
    expect(selectSpaceByIndex(order, 0, 's2')).toBe('s2');
  });
});

describe('activationTarget', () => {
  it('picks the most recently active tab', () => {
    const f = fixture();
    f.tabs = f.tabs.map((t) => (t.id === 't2' ? { ...t, lastActiveAt: 50 } : t.id === 'p2' ? { ...t, lastActiveAt: 10 } : t));
    expect(activationTarget(f, 's1')).toEqual({ type: 'tab', tabId: 't2' });
  });

  it('falls back to the first visible tab, then a new Today tab', () => {
    const f = fixture();
    expect(activationTarget(f, 's1')).toEqual({ type: 'tab', tabId: 'p1' });
    expect(activationTarget(f, 'w1')).toEqual({ type: 'new-today-tab' });
  });
});

describe('sidebarVisibility', () => {
  it('is always visible when auto-hide is off', () => {
    expect(sidebarVisibility(false, 500, false)).toBe(true);
  });

  it('shows within 8px of the left edge or over the sidebar', () => {
    expect(sidebarVisibility(true, 0, false)).toBe(true);
    expect(sidebarVisibility(true, 8, false)).toBe(true);
    expect(sidebarVisibility(true, 9, false)).toBe(false);
    expect(sidebarVisibility(true, 300, true)).toBe(true);
    expect(sidebarVisibility(true, null, false)).toBe(false);
  });
});

describe('layout module purity', () => {
  it('does not import electron or node modules', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../../src/main/sidebar/layout.ts'), 'utf8');
    expect(src).not.toMatch(/from\s+['"](electron|fs|path)['"]|require\(/);
  });
});
