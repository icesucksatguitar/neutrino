import { describe, expect, it } from 'vitest';
import {
  cancelDragSession,
  dropOp,
  insertionIndex,
  isFailedMoveResult,
  passedThreshold,
  retargetDragSession,
  sameTarget,
  startDragSession,
  withLayout,
  type Rect,
} from '../../../src/renderer/utils/sidebarDrag';
import { buildSidebarView, toProfilesFile, type SidebarSource } from '../../../src/renderer/utils/sidebarModel';
import type { TabState } from '../../../src/renderer/types';

function tab(id: string, spaceId: string, extra: Partial<TabState> = {}): TabState {
  return {
    id,
    spaceId,
    title: id,
    url: `https://${id}.example/`,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    isPinned: false,
    isSleeping: false,
    blockedCount: 0,
    ...extra,
  };
}

function source(): SidebarSource {
  return {
    profiles: [
      { id: 'default', name: 'Default', createdAt: 10 },
      { id: 'work', name: 'Work', createdAt: 20 },
    ],
    activeProfileId: 'default',
    spaces: [
      { id: 'd1', name: 'Home', icon: 'Home', color: '#00f', profileId: 'default', order: 0 },
      { id: 'd2', name: 'Fun', icon: 'Coffee', color: '#0f0', profileId: 'default', order: 1 },
      { id: 'w1', name: 'Office', icon: 'Briefcase', color: '#f00', profileId: 'work', order: 0 },
    ],
    activeSpaceId: 'd1',
    activeTabId: 'a',
    tabs: [
      tab('p1', 'd1', { section: 'pinned', isPinned: true, isSleeping: true }),
      tab('a', 'd1', { section: 'today', isLoading: true }),
      tab('b', 'd1', { section: 'today' }),
      tab('c', 'd1', { section: 'today' }),
      tab('x', 'd2', { section: 'today' }),
    ],
    favorites: [
      { id: 'f1', profileId: 'default', url: 'https://mail.example/', title: 'Mail', order: 0 },
      { id: 'f2', profileId: 'default', url: 'https://news.example/', title: 'News', order: 1 },
    ],
  };
}

const ids = (items: { id: string }[]) => items.map((i) => i.id);

// Rows 32px tall stacked from y=0; tiles 40x40 in a 2-column grid.
const rows = (n: number): Rect[] =>
  Array.from({ length: n }, (_, i) => ({ left: 0, right: 200, top: i * 32, bottom: i * 32 + 32 }));
const tiles: Rect[] = [
  { left: 0, right: 40, top: 0, bottom: 40 },
  { left: 50, right: 90, top: 0, bottom: 40 },
  { left: 0, right: 40, top: 50, bottom: 90 },
];

describe('insertionIndex', () => {
  it('uses row midpoints in a list', () => {
    expect(insertionIndex(rows(3), 10, -5, 'list')).toBe(0);
    expect(insertionIndex(rows(3), 10, 15, 'list')).toBe(0);
    expect(insertionIndex(rows(3), 10, 17, 'list')).toBe(1);
    expect(insertionIndex(rows(3), 10, 80, 'list')).toBe(2); // exactly on the last midpoint
    expect(insertionIndex(rows(3), 10, 85, 'list')).toBe(3);
    expect(insertionIndex(rows(3), 10, 500, 'list')).toBe(3);
    expect(insertionIndex([], 10, 10, 'list')).toBe(0);
  });

  it('counts earlier rows and left-of-pointer tiles in a grid', () => {
    expect(insertionIndex(tiles, 5, 20, 'grid')).toBe(0);
    expect(insertionIndex(tiles, 30, 20, 'grid')).toBe(1);
    expect(insertionIndex(tiles, 80, 20, 'grid')).toBe(2);
    expect(insertionIndex(tiles, 5, 70, 'grid')).toBe(2);
    expect(insertionIndex(tiles, 30, 70, 'grid')).toBe(3);
    expect(insertionIndex(tiles, 5, 200, 'grid')).toBe(3);
  });
});

describe('dropOp', () => {
  const today = { kind: 'today' as const, id: 'b', index: 1 };

  it('reorders within a section and ignores drops at the original position', () => {
    expect(dropOp(today, { type: 'section', section: 'today', index: 1 }, 'd1')).toBeNull();
    expect(dropOp(today, { type: 'section', section: 'today', index: 0 }, 'd1')).toEqual({
      type: 'reorder',
      section: 'today',
      id: 'b',
      toIndex: 0,
    });
  });

  it('changes section with the target index in the active space', () => {
    expect(dropOp(today, { type: 'section', section: 'favorite', index: 1 }, 'd1')).toEqual({
      type: 'section',
      id: 'b',
      from: 'today',
      to: 'favorite',
      spaceId: 'd1',
      toIndex: 1,
    });
  });

  it('moves onto another space, but not onto the space the row is already in', () => {
    expect(dropOp(today, { type: 'space', spaceId: 'd1' }, 'd1')).toBeNull();
    expect(dropOp(today, { type: 'space', spaceId: 'w1' }, 'd1')).toEqual({
      type: 'space',
      id: 'b',
      from: 'today',
      targetSpaceId: 'w1',
    });
    const fav = { kind: 'favorite' as const, id: 'f1', index: 0 };
    expect(dropOp(fav, { type: 'space', spaceId: 'd1' }, 'd1')).toMatchObject({ type: 'space', from: 'favorite' });
  });

  it('returns null without a target', () => {
    expect(dropOp(today, null, 'd1')).toBeNull();
  });
});

describe('sameTarget', () => {
  it('compares by value', () => {
    expect(sameTarget(null, null)).toBe(true);
    expect(sameTarget({ type: 'space', spaceId: 'a' }, { type: 'space', spaceId: 'a' })).toBe(true);
    expect(sameTarget({ type: 'space', spaceId: 'a' }, null)).toBe(false);
    expect(
      sameTarget({ type: 'section', section: 'today', index: 1 }, { type: 'section', section: 'today', index: 2 }),
    ).toBe(false);
  });
});

describe('drag session', () => {
  it('previews the move, and cancelling restores the original layout', () => {
    const src = source();
    const file = toProfilesFile(src);
    const before = structuredClone(file);
    let s = startDragSession(file, { kind: 'today', id: 'c', index: 2 }, 'd1');
    s = retargetDragSession(s, { type: 'section', section: 'pinned', index: 0 });
    const view = buildSidebarView(withLayout(src, s.preview));
    expect(ids(view.pinned)).toEqual(['c', 'p1']);
    expect(ids(view.today)).toEqual(['a', 'b']);

    s = retargetDragSession(s, { type: 'space', spaceId: 'w1' });
    expect(ids(buildSidebarView(withLayout(src, s.preview)).today)).toEqual(['a', 'b']);

    expect(cancelDragSession(s)).toEqual(before);
    expect(file).toEqual(before);
  });

  it('shows the snapshot when the target is a no-op and keeps identity for an unchanged target', () => {
    const src = source();
    let s = startDragSession(toProfilesFile(src), { kind: 'today', id: 'a', index: 0 }, 'd1');
    const t = { type: 'section' as const, section: 'today' as const, index: 0 };
    s = retargetDragSession(s, t);
    expect(s.op).toBeNull();
    expect(s.preview).toBe(s.snapshot.file);
    expect(retargetDragSession(s, { ...t })).toBe(s);
  });
});

describe('withLayout', () => {
  it('keeps live tab fields and renders reorders, section changes and favorites', () => {
    const src = source();
    let s = startDragSession(toProfilesFile(src), { kind: 'today', id: 'a', index: 0 }, 'd1');
    s = retargetDragSession(s, { type: 'section', section: 'today', index: 2 });
    const shown = withLayout(src, s.preview);
    expect(ids(buildSidebarView(shown).today)).toEqual(['b', 'c', 'a']);
    expect(shown.tabs.find((t) => t.id === 'a')?.isLoading).toBe(true);
    expect(shown.tabs.find((t) => t.id === 'p1')?.isSleeping).toBe(true);

    s = retargetDragSession(s, { type: 'section', section: 'favorite', index: 1 });
    const favView = buildSidebarView(withLayout(src, s.preview));
    expect(ids(favView.favorites)).toEqual(['f1', 'a', 'f2']);
    expect(ids(favView.today)).toEqual(['b', 'c']);
  });

  it('renders a favorite dragged into Today as an unloaded row', () => {
    const src = source();
    let s = startDragSession(toProfilesFile(src), { kind: 'favorite', id: 'f2', index: 1 }, 'd1');
    s = retargetDragSession(s, { type: 'section', section: 'today', index: 1 });
    const shown = withLayout(src, s.preview);
    const view = buildSidebarView(shown);
    expect(ids(view.today)).toEqual(['a', 'f2', 'b', 'c']);
    expect(ids(view.favorites)).toEqual(['f1']);
    expect(shown.tabs.find((t) => t.id === 'f2')).toMatchObject({ spaceId: 'd1', section: 'today', unloaded: true });
  });
});

describe('small helpers', () => {
  it('passedThreshold', () => {
    expect(passedThreshold(2, 2)).toBe(false);
    expect(passedThreshold(4, 0)).toBe(true);
  });

  it('isFailedMoveResult', () => {
    expect(isFailedMoveResult({ ok: false, error: 'x' })).toBe(true);
    expect(isFailedMoveResult({ ok: true, needsReload: true })).toBe(false);
    expect(isFailedMoveResult(undefined)).toBe(false);
  });
});
