// Renderer-side adapter between the live browser state (`state-update`) and the
// pure sidebar layout model in `src/main/sidebar/layout.ts`. No React, no DOM,
// so it is unit testable in the node test environment.

import {
  spaceSwitcherGroups,
  visibleTabsForSpace,
} from '../../main/sidebar/layout';
import type { ProfilesFile, SpaceRecord, TabEntry } from '../../main/profiles/types';
import type { BrowserAppState, FavoriteEntry, MoveOp, Profile, Space, TabState } from '../types';

/** Fields of the renderer state the sidebar reads. */
export type SidebarSource = Pick<
  BrowserAppState,
  'tabs' | 'spaces' | 'activeSpaceId' | 'activeTabId' | 'favorites' | 'profiles' | 'activeProfileId'
>;

/** Profile id used for spaces/profiles before the first `state-update` arrives. */
export const FALLBACK_PROFILE_ID = 'default';

export type SidebarItemKind = 'favorite' | 'pinned' | 'today';

/** One row/tile in the sidebar; handed to extension hooks (drag and drop, previews). */
export interface SidebarItemRef {
  kind: SidebarItemKind;
  id: string;
  /** Position within its section. */
  index: number;
  url: string;
  title: string;
  favicon?: string;
  /** Live tab for pinned/Today rows, or the open tab of a favorite (if any). */
  tab?: TabState;
  favorite?: FavoriteEntry;
}

export interface SwitcherGroup {
  profile: Profile;
  spaces: Space[];
}

export interface SidebarView {
  favorites: SidebarItemRef[];
  pinned: SidebarItemRef[];
  today: SidebarItemRef[];
  /** Space_Switcher: profiles in creation order, spaces by order (R13.1). */
  groups: SwitcherGroup[];
  /** Flat switcher order (swipe, Ctrl+1..9). */
  spaceOrder: Space[];
  activeSpace: Space | undefined;
  /** Owner of the active space. */
  activeProfile: Profile | undefined;
}

function sectionOf(tab: TabState): 'pinned' | 'today' {
  return tab.section ?? (tab.isPinned ? 'pinned' : 'today');
}

function profilesOf(src: SidebarSource): Profile[] {
  if (src.profiles && src.profiles.length > 0) return src.profiles;
  // Placeholder state: one synthetic profile owns every space.
  return [{ id: src.activeProfileId ?? FALLBACK_PROFILE_ID, name: 'Default', createdAt: 0 }];
}

/**
 * Builds a `ProfilesFile` from the renderer state. Tab `order` is the tab's
 * position in `state.tabs`, which the main process sends in layout order.
 */
export function toProfilesFile(src: SidebarSource): ProfilesFile {
  const profiles = profilesOf(src);
  const fallbackOwner = src.activeProfileId ?? profiles[0].id;
  const spaces: SpaceRecord[] = src.spaces.map((s, i) => ({
    id: s.id,
    profileId: s.profileId ?? fallbackOwner,
    name: s.name,
    icon: s.icon,
    color: s.color,
    order: s.order ?? i,
  }));
  const tabs: TabEntry[] = src.tabs.map((t, i) => ({
    id: t.id,
    spaceId: t.spaceId,
    section: sectionOf(t),
    url: t.url,
    title: t.title,
    order: i,
    lastActiveAt: t.lastActiveAt ?? 0,
    ...(t.favicon !== undefined ? { favicon: t.favicon } : {}),
    ...(t.unloaded ? { unloaded: true } : {}),
  }));
  return {
    schemaVersion: 1,
    profiles: profiles.map(({ id, name, createdAt }) => ({ id, name, createdAt })),
    spaces,
    tabs,
    favorites: src.favorites ?? [],
    archive: [],
    neverList: {},
  };
}

/** Normalizes a URL for "is this favorite already open" matching. */
function sameUrl(a: string, b: string): boolean {
  const norm = (u: string) => u.trim().replace(/\/+$/, '').toLowerCase();
  return norm(a) === norm(b);
}

/** The open tab showing a favorite in the given space, if any. */
export function openTabForFavorite(
  fav: FavoriteEntry,
  tabs: readonly TabState[],
  spaceId: string,
): TabState | undefined {
  return (
    tabs.find((t) => t.id === fav.id) ??
    tabs.find((t) => t.spaceId === spaceId && !t.unloaded && sameUrl(t.url, fav.url))
  );
}

export type FavoriteActivation =
  | { type: 'select'; tabId: string }
  | { type: 'create'; url: string; spaceId: string };

/**
 * Click on a favorite (R14.3): activate its open tab, otherwise open its URL as
 * a new tab in the active space, which loads in the active profile's session.
 */
export function favoriteActivation(
  fav: FavoriteEntry,
  tabs: readonly TabState[],
  activeSpaceId: string,
): FavoriteActivation {
  const open = openTabForFavorite(fav, tabs, activeSpaceId);
  return open ? { type: 'select', tabId: open.id } : { type: 'create', url: fav.url, spaceId: activeSpaceId };
}

export function buildSidebarView(src: SidebarSource): SidebarView {
  const file = toProfilesFile(src);
  const layout = visibleTabsForSpace(file, src.activeSpaceId);
  const tabById = new Map(src.tabs.map((t) => [t.id, t]));
  const spaceById = new Map(src.spaces.map((s) => [s.id, s]));
  const profileById = new Map(profilesOf(src).map((p) => [p.id, p]));

  const tabRef = (kind: 'pinned' | 'today') => (e: TabEntry, index: number): SidebarItemRef => ({
    kind,
    id: e.id,
    index,
    url: e.url,
    title: e.title,
    ...(e.favicon !== undefined ? { favicon: e.favicon } : {}),
    tab: tabById.get(e.id),
  });

  const favorites = layout.favorites.map((f, index): SidebarItemRef => {
    const tab = openTabForFavorite(f, src.tabs, src.activeSpaceId);
    return {
      kind: 'favorite',
      id: f.id,
      index,
      url: f.url,
      title: f.title,
      ...(f.favicon !== undefined ? { favicon: f.favicon } : tab?.favicon ? { favicon: tab.favicon } : {}),
      ...(tab ? { tab } : {}),
      favorite: f,
    };
  });

  const groups: SwitcherGroup[] = spaceSwitcherGroups(file).map((g) => ({
    profile: profileById.get(g.profile.id) ?? g.profile,
    spaces: g.spaces.map((s) => spaceById.get(s.id)!).filter(Boolean),
  }));

  const activeSpace = spaceById.get(src.activeSpaceId);
  const activeOwner = file.spaces.find((s) => s.id === src.activeSpaceId)?.profileId;

  return {
    favorites,
    pinned: layout.pinned.map(tabRef('pinned')),
    today: layout.today.map(tabRef('today')),
    groups,
    spaceOrder: groups.flatMap((g) => g.spaces),
    activeSpace,
    activeProfile: activeOwner !== undefined ? profileById.get(activeOwner) : undefined,
  };
}

/**
 * Next (`+1`) or previous (`-1`) space in switcher order for the swipe gesture
 * (R13.3). No wrap-around: at either end the current space stays.
 */
export function adjacentSpaceId(
  order: readonly { id: string }[],
  currentId: string,
  direction: 1 | -1,
): string {
  const i = order.findIndex((s) => s.id === currentId);
  if (i < 0) return order[0]?.id ?? currentId;
  const next = order[i + direction];
  return next ? next.id : currentId;
}

export type SidebarMenuAction =
  | 'pin'
  | 'unpin'
  | 'add-favorite'
  | 'remove-favorite'
  | 'move-to-space'
  | 'duplicate'
  | 'close';

/** Context-menu actions offered for an item (R12.10). */
export function contextMenuActions(item: Pick<SidebarItemRef, 'kind' | 'tab'>): SidebarMenuAction[] {
  switch (item.kind) {
    case 'today':
      return ['pin', 'add-favorite', 'move-to-space', 'duplicate', 'close'];
    case 'pinned':
      return ['unpin', 'add-favorite', 'move-to-space', 'duplicate', 'close'];
    case 'favorite':
      // A favorite has no tab of its own; "close" closes its open tab, if any.
      return item.tab
        ? ['remove-favorite', 'move-to-space', 'duplicate', 'close']
        : ['remove-favorite', 'move-to-space', 'duplicate'];
  }
}

/** Move-to-space op for the context menu; lands at the end of the target space. */
export function moveToSpaceOp(item: Pick<SidebarItemRef, 'kind' | 'id'>, targetSpaceId: string): MoveOp {
  return { type: 'space', id: item.id, from: item.kind, targetSpaceId };
}
