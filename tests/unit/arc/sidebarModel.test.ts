import { describe, expect, it } from 'vitest';
import {
  adjacentSpaceId,
  buildSidebarView,
  contextMenuActions,
  favoriteActivation,
  moveToSpaceOp,
  toProfilesFile,
  type SidebarSource,
} from '../../../src/renderer/utils/sidebarModel';
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

function source(overrides: Partial<SidebarSource> = {}): SidebarSource {
  return {
    profiles: [
      { id: 'work', name: 'Work', createdAt: 20 },
      { id: 'default', name: 'Default', createdAt: 10 },
    ],
    activeProfileId: 'default',
    spaces: [
      { id: 'w1', name: 'Office', icon: 'Briefcase', color: '#f00', profileId: 'work', order: 0 },
      { id: 'd2', name: 'Fun', icon: 'Coffee', color: '#0f0', profileId: 'default', order: 1 },
      { id: 'd1', name: 'Home', icon: 'Home', color: '#00f', profileId: 'default', order: 0 },
    ],
    activeSpaceId: 'd1',
    activeTabId: 't2',
    tabs: [
      tab('t1', 'd1', { section: 'pinned', isPinned: true, unloaded: true, isSleeping: true }),
      tab('t2', 'd1', { section: 'today' }),
      tab('t3', 'd1'), // no `section`: derived from isPinned
      tab('t4', 'd2', { section: 'today' }),
      tab('t5', 'd1', { isPinned: true }),
    ],
    favorites: [
      { id: 'f2', profileId: 'default', url: 'https://t2.example/', title: 'T2', order: 1 },
      { id: 'f1', profileId: 'default', url: 'https://mail.example/', title: 'Mail', order: 0 },
      { id: 'fw', profileId: 'work', url: 'https://jira.example/', title: 'Jira', order: 0 },
    ],
    ...overrides,
  };
}

describe('toProfilesFile', () => {
  it('maps tabs in state order and derives the section from isPinned when absent', () => {
    const file = toProfilesFile(source());
    expect(file.tabs.map((t) => [t.id, t.section, t.order])).toEqual([
      ['t1', 'pinned', 0],
      ['t2', 'today', 1],
      ['t3', 'today', 2],
      ['t4', 'today', 3],
      ['t5', 'pinned', 4],
    ]);
    expect(file.tabs[0].unloaded).toBe(true);
    expect(file.tabs[1].lastActiveAt).toBe(0);
  });

  it('assigns ownerless placeholder spaces to a synthetic profile', () => {
    const file = toProfilesFile({
      tabs: [],
      spaces: [{ id: 's', name: 'S', icon: 'Folder', color: '#fff' }],
      activeSpaceId: 's',
      activeTabId: null,
    });
    expect(file.profiles.map((p) => p.id)).toEqual(['default']);
    expect(file.spaces[0].profileId).toBe('default');
  });
});

describe('buildSidebarView', () => {
  it('shows the owning profile favorites and the active space pinned/today tabs', () => {
    const view = buildSidebarView(source());
    expect(view.favorites.map((f) => f.id)).toEqual(['f1', 'f2']);
    expect(view.pinned.map((t) => t.id)).toEqual(['t1', 't5']);
    expect(view.today.map((t) => t.id)).toEqual(['t2', 't3']);
    expect(view.pinned[0].tab?.unloaded).toBe(true);
    expect(view.today.map((t) => t.index)).toEqual([0, 1]);
    // f2's URL is open in the active space as t2.
    expect(view.favorites[1].tab?.id).toBe('t2');
    expect(view.favorites[0].tab).toBeUndefined();
  });

  it('groups every profile spaces in creation order for the switcher', () => {
    const view = buildSidebarView(source());
    expect(view.groups.map((g) => [g.profile.id, g.spaces.map((s) => s.id)])).toEqual([
      ['default', ['d1', 'd2']],
      ['work', ['w1']],
    ]);
    expect(view.spaceOrder.map((s) => s.id)).toEqual(['d1', 'd2', 'w1']);
    expect(view.activeSpace?.name).toBe('Home');
    expect(view.activeProfile?.id).toBe('default');
  });

  it('switches favorites with the active space owner', () => {
    const view = buildSidebarView(source({ activeSpaceId: 'w1' }));
    expect(view.favorites.map((f) => f.id)).toEqual(['fw']);
    expect(view.pinned).toEqual([]);
    expect(view.today).toEqual([]);
    expect(view.activeProfile?.id).toBe('work');
  });
});

describe('favoriteActivation', () => {
  const fav = { id: 'f1', profileId: 'default', url: 'https://mail.example', title: 'Mail', order: 0 };

  it('selects the open tab with the same URL in the active space', () => {
    const tabs = [tab('x', 'd1', { url: 'https://mail.example/' })];
    expect(favoriteActivation(fav, tabs, 'd1')).toEqual({ type: 'select', tabId: 'x' });
  });

  it('opens the URL as a new tab in the active space otherwise', () => {
    const tabs = [
      tab('x', 'd2', { url: 'https://mail.example/' }),
      tab('y', 'd1', { url: 'https://mail.example/', unloaded: true }),
    ];
    expect(favoriteActivation(fav, tabs, 'd1')).toEqual({
      type: 'create',
      url: 'https://mail.example',
      spaceId: 'd1',
    });
  });
});

describe('adjacentSpaceId', () => {
  const order = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  it('moves one step without wrapping', () => {
    expect(adjacentSpaceId(order, 'b', 1)).toBe('c');
    expect(adjacentSpaceId(order, 'b', -1)).toBe('a');
    expect(adjacentSpaceId(order, 'c', 1)).toBe('c');
    expect(adjacentSpaceId(order, 'a', -1)).toBe('a');
  });
  it('falls back to the first space for an unknown current id', () => {
    expect(adjacentSpaceId(order, 'zz', 1)).toBe('a');
    expect(adjacentSpaceId([], 'zz', 1)).toBe('zz');
  });
});

describe('context menu', () => {
  it('offers the R12.10 actions per item kind', () => {
    expect(contextMenuActions({ kind: 'today' })).toEqual(['pin', 'add-favorite', 'move-to-space', 'duplicate', 'close']);
    expect(contextMenuActions({ kind: 'pinned' })).toEqual(['unpin', 'add-favorite', 'move-to-space', 'duplicate', 'close']);
    expect(contextMenuActions({ kind: 'favorite' })).toEqual(['remove-favorite', 'move-to-space', 'duplicate']);
    expect(contextMenuActions({ kind: 'favorite', tab: tab('t', 'd1') })).toContain('close');
  });

  it('builds a space move op from the item section', () => {
    expect(moveToSpaceOp({ kind: 'pinned', id: 't1' }, 'w1')).toEqual({
      type: 'space',
      id: 't1',
      from: 'pinned',
      targetSpaceId: 'w1',
    });
  });
});
