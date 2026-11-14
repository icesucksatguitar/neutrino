// Arc-style sidebar layout model. Pure: no Electron or Node imports, so the
// renderer can import it too. Every operation takes a `ProfilesFile` and
// returns a new one; inputs are never mutated.
//
// Sections, top to bottom: favorites (per profile, shared by all its spaces),
// pinned (per space), today (per space). `order` fields are renumbered 0..n-1
// in every list an operation touches, keeping the relative order of the
// untouched entries.

import type {
  FavoriteEntry,
  Profile,
  ProfilesFile,
  SpaceRecord,
  TabEntry,
  TabSection,
} from '../profiles/types';

export type LayoutSection = 'favorite' | TabSection;

export interface Layout {
  favorites: FavoriteEntry[];
  pinned: TabEntry[];
  today: TabEntry[];
}

/**
 * Drag-and-drop / context-menu move.
 * - `reorder`: within the item's own section list (favorites of its profile,
 *   or pinned/today of its space). `toIndex` is the position after removal.
 * - `section`: between favorites/pinned/today as shown for `spaceId` (the
 *   space whose sidebar is visible). A favorite target lands in the favorites
 *   of `spaceId`'s owning profile. `toIndex` defaults to the end.
 * - `space`: drop onto a Space_Switcher icon. Pinned tabs go to the target's
 *   pinned section, everything else to its Today list, appended at the end.
 */
export type MoveOp =
  | { type: 'reorder'; section: LayoutSection; id: string; toIndex: number }
  | {
      type: 'section';
      id: string;
      from: LayoutSection;
      to: LayoutSection;
      spaceId: string;
      toIndex?: number;
    }
  | { type: 'space'; id: string; from: LayoutSection; targetSpaceId: string };

export interface MoveResult {
  file: ProfilesFile;
  /** True exactly when source and destination profiles differ (R17.4/17.5). */
  needsReload: boolean;
}

export interface DragSnapshot {
  readonly file: ProfilesFile;
}

export type ActivationTarget =
  | { type: 'tab'; tabId: string }
  | { type: 'new-today-tab' };

/** Auto-hide reveal zone width at the left window edge (decision A8). */
export const SIDEBAR_EDGE_PX = 8;

// ---------------------------------------------------------------------------
// Helpers

function byOrder<T extends { order: number }>(items: readonly T[]): T[] {
  // Array.prototype.sort is stable, so equal orders keep array position.
  return [...items].sort((a, b) => a.order - b.order);
}

function ownerOf(file: ProfilesFile, spaceId: string): string | undefined {
  return file.spaces.find((s) => s.id === spaceId)?.profileId;
}

function clampIndex(index: number | undefined, length: number): number {
  if (index === undefined || !Number.isFinite(index)) return length;
  return Math.max(0, Math.min(length, Math.trunc(index)));
}

/** Returns a copy of `items` with the element at `fromIndex` moved to `toIndex`. */
export function reorder<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  const out = [...items];
  if (fromIndex < 0 || fromIndex >= out.length || !Number.isInteger(fromIndex)) return out;
  const [item] = out.splice(fromIndex, 1);
  out.splice(clampIndex(toIndex, out.length), 0, item);
  return out;
}

type Located =
  | { kind: 'favorite'; item: FavoriteEntry; profileId: string }
  | { kind: 'tab'; item: TabEntry; profileId: string | undefined };

function locate(file: ProfilesFile, id: string, section: LayoutSection): Located | null {
  if (section === 'favorite') {
    const item = file.favorites.find((f) => f.id === id);
    return item ? { kind: 'favorite', item, profileId: item.profileId } : null;
  }
  const item = file.tabs.find((t) => t.id === id && t.section === section);
  return item ? { kind: 'tab', item, profileId: ownerOf(file, item.spaceId) } : null;
}

type Destination =
  | { section: 'favorite'; profileId: string; index?: number }
  | { section: TabSection; spaceId: string; profileId: string; index?: number };

/** Replaces the entries of one tab list (section+space) with `list`, renumbered. */
function writeTabList(
  tabs: readonly TabEntry[],
  section: TabSection,
  spaceId: string,
  list: readonly TabEntry[],
): TabEntry[] {
  const rest = tabs.filter((t) => !(t.section === section && t.spaceId === spaceId));
  return [...rest, ...list.map((t, i) => ({ ...t, order: i }))];
}

function writeFavoriteList(
  favorites: readonly FavoriteEntry[],
  profileId: string,
  list: readonly FavoriteEntry[],
): FavoriteEntry[] {
  const rest = favorites.filter((f) => f.profileId !== profileId);
  return [...rest, ...list.map((f, i) => ({ ...f, order: i }))];
}

/**
 * Removes `src` from its list and inserts it into `dest`, converting kind as
 * needed. Both affected lists are renumbered. Ids are preserved.
 */
function relocate(file: ProfilesFile, src: Located, dest: Destination, now: number): ProfilesFile {
  let tabs = file.tabs;
  let favorites = file.favorites;

  // 1. Remove from source list and renumber it.
  if (src.kind === 'favorite') {
    const list = byOrder(favorites.filter((f) => f.profileId === src.profileId && f.id !== src.item.id));
    favorites = writeFavoriteList(
      favorites.filter((f) => f.id !== src.item.id),
      src.profileId,
      list,
    );
  } else {
    const { section, spaceId, id } = src.item;
    const list = byOrder(tabs.filter((t) => t.section === section && t.spaceId === spaceId && t.id !== id));
    tabs = writeTabList(
      tabs.filter((t) => t.id !== id),
      section,
      spaceId,
      list,
    );
  }

  // 2. Insert into destination list.
  const base = src.item;
  if (dest.section === 'favorite') {
    const moved: FavoriteEntry = {
      id: base.id,
      profileId: dest.profileId,
      url: base.url,
      title: base.title,
      order: 0,
      ...(base.favicon !== undefined ? { favicon: base.favicon } : {}),
    };
    const list = byOrder(favorites.filter((f) => f.profileId === dest.profileId));
    list.splice(clampIndex(dest.index, list.length), 0, moved);
    favorites = writeFavoriteList(favorites, dest.profileId, list);
  } else {
    const moved: TabEntry =
      src.kind === 'tab'
        ? { ...src.item, spaceId: dest.spaceId, section: dest.section }
        : {
            id: base.id,
            spaceId: dest.spaceId,
            section: dest.section,
            url: base.url,
            title: base.title,
            order: 0,
            lastActiveAt: now,
            ...(base.favicon !== undefined ? { favicon: base.favicon } : {}),
          };
    const list = byOrder(tabs.filter((t) => t.section === dest.section && t.spaceId === dest.spaceId));
    list.splice(clampIndex(dest.index, list.length), 0, moved);
    tabs = writeTabList(tabs, dest.section, dest.spaceId, list);
  }

  return { ...file, tabs, favorites };
}

// ---------------------------------------------------------------------------
// Queries

/** Favorites of the space's owning profile; pinned and today of the space. */
export function visibleTabsForSpace(file: ProfilesFile, spaceId: string): Layout {
  const profileId = ownerOf(file, spaceId);
  if (profileId === undefined) return { favorites: [], pinned: [], today: [] };
  return {
    favorites: byOrder(file.favorites.filter((f) => f.profileId === profileId)),
    pinned: byOrder(file.tabs.filter((t) => t.spaceId === spaceId && t.section === 'pinned')),
    today: byOrder(file.tabs.filter((t) => t.spaceId === spaceId && t.section === 'today')),
  };
}

function profilesInCreationOrder(file: ProfilesFile): Profile[] {
  return [...file.profiles].sort((a, b) => a.createdAt - b.createdAt);
}

/** Space_Switcher groups: profiles in creation order, spaces by `order` (R13.1). */
export function spaceSwitcherGroups(
  file: ProfilesFile,
): Array<{ profile: Profile; spaces: SpaceRecord[] }> {
  return profilesInCreationOrder(file).map((profile) => ({
    profile,
    spaces: byOrder(file.spaces.filter((s) => s.profileId === profile.id)),
  }));
}

/** Flat Space_Switcher order used by Ctrl+1..9 and swipe navigation. */
export function spaceSwitcherOrder(file: ProfilesFile): SpaceRecord[] {
  return spaceSwitcherGroups(file).flatMap((g) => g.spaces);
}

/**
 * Ctrl+N: the Nth (1-based) space in switcher order, or `current` when fewer
 * than N spaces exist or N is not a positive integer (R13.4/13.5).
 */
export function selectSpaceByIndex(
  orderedSpaces: readonly { id: string }[],
  n: number,
  current: string,
): string {
  if (!Number.isInteger(n) || n < 1 || n > orderedSpaces.length) return current;
  return orderedSpaces[n - 1].id;
}

/**
 * Tab to activate when `spaceId` becomes active (R13.6): the tab with the
 * greatest `lastActiveAt` (> 0), else the first visible tab (pinned, then
 * today), else a new Today tab. Ties go to the earlier visible tab.
 */
export function activationTarget(file: ProfilesFile, spaceId: string): ActivationTarget {
  const { pinned, today } = visibleTabsForSpace(file, spaceId);
  const visible = [...pinned, ...today];
  if (visible.length === 0) return { type: 'new-today-tab' };
  let best: TabEntry | null = null;
  for (const t of visible) {
    if (t.lastActiveAt > 0 && (best === null || t.lastActiveAt > best.lastActiveAt)) best = t;
  }
  return { type: 'tab', tabId: (best ?? visible[0]).id };
}

/**
 * Auto-hide visibility (R12.4): always shown when auto-hide is off; otherwise
 * shown while the pointer is within 8px of the left edge or over the sidebar.
 */
export function sidebarVisibility(
  autoHide: boolean,
  pointerX: number | null,
  overSidebar: boolean,
): boolean {
  if (!autoHide) return true;
  if (overSidebar) return true;
  return (
    pointerX !== null && Number.isFinite(pointerX) && pointerX >= 0 && pointerX <= SIDEBAR_EDGE_PX
  );
}

// ---------------------------------------------------------------------------
// Moves

const UNCHANGED = (file: ProfilesFile): MoveResult => ({ file, needsReload: false });

export function move(file: ProfilesFile, op: MoveOp, now: number = Date.now()): MoveResult {
  if (op.type === 'reorder') {
    const src = locate(file, op.id, op.section);
    if (!src) return UNCHANGED(file);
    const dest: Destination =
      src.kind === 'favorite'
        ? { section: 'favorite', profileId: src.profileId, index: op.toIndex }
        : {
            section: src.item.section,
            spaceId: src.item.spaceId,
            profileId: src.profileId ?? '',
            index: op.toIndex,
          };
    return { file: relocate(file, src, dest, now), needsReload: false };
  }

  const src = locate(file, op.id, op.from);
  if (!src) return UNCHANGED(file);

  let targetSpaceId: string;
  let toSection: LayoutSection;
  let index: number | undefined;
  if (op.type === 'section') {
    targetSpaceId = op.spaceId;
    toSection = op.to;
    index = op.toIndex;
  } else {
    targetSpaceId = op.targetSpaceId;
    toSection = op.from === 'pinned' ? 'pinned' : 'today';
    index = undefined;
  }

  const destProfile = ownerOf(file, targetSpaceId);
  if (destProfile === undefined) return UNCHANGED(file);

  const dest: Destination =
    toSection === 'favorite'
      ? { section: 'favorite', profileId: destProfile, index }
      : { section: toSection, spaceId: targetSpaceId, profileId: destProfile, index };

  return {
    file: relocate(file, src, dest, now),
    needsReload: src.profileId !== destProfile,
  };
}

/** Snapshot taken when a drag starts; `cancelDrag` restores it (R17.7). */
export function beginDrag(file: ProfilesFile): DragSnapshot {
  return { file: structuredClone(file) };
}

export function cancelDrag(snapshot: DragSnapshot): ProfilesFile {
  return structuredClone(snapshot.file);
}

// ---------------------------------------------------------------------------
// Context-menu actions

/** Pin a Today tab into its own space's pinned section, at the end (R15.1). */
export function pin(file: ProfilesFile, tabId: string, now: number = Date.now()): ProfilesFile {
  const tab = file.tabs.find((t) => t.id === tabId && t.section === 'today');
  if (!tab) return file;
  return move(file, { type: 'section', id: tabId, from: 'today', to: 'pinned', spaceId: tab.spaceId }, now).file;
}

/** Unpin into the same space's Today list, at the end (R15.5). */
export function unpin(file: ProfilesFile, tabId: string, now: number = Date.now()): ProfilesFile {
  const tab = file.tabs.find((t) => t.id === tabId && t.section === 'pinned');
  if (!tab) return file;
  return move(file, { type: 'section', id: tabId, from: 'pinned', to: 'today', spaceId: tab.spaceId }, now).file;
}

/**
 * Move a pinned or Today tab into the favorites of the profile that owns the
 * tab's space, at the end (R14.1).
 */
export function addFavorite(file: ProfilesFile, tabId: string, now: number = Date.now()): ProfilesFile {
  const tab = file.tabs.find((t) => t.id === tabId);
  if (!tab) return file;
  return move(file, { type: 'section', id: tabId, from: tab.section, to: 'favorite', spaceId: tab.spaceId }, now).file;
}

/** Delete a favorite from its profile's list (R14.4). */
export function removeFavorite(file: ProfilesFile, favoriteId: string): ProfilesFile {
  const fav = file.favorites.find((f) => f.id === favoriteId);
  if (!fav) return file;
  const list = byOrder(file.favorites.filter((f) => f.profileId === fav.profileId && f.id !== favoriteId));
  return {
    ...file,
    favorites: writeFavoriteList(
      file.favorites.filter((f) => f.id !== favoriteId),
      fav.profileId,
      list,
    ),
  };
}

/**
 * Duplicate a tab as a new Today tab with id `newId`. A Today tab's copy goes
 * right after it; a pinned tab's copy goes to the end of the same space's
 * Today list. A favorite's copy goes to the end of `spaceId`'s Today list
 * (required for favorites, ignored otherwise).
 */
export function duplicate(
  file: ProfilesFile,
  id: string,
  newId: string,
  now: number = Date.now(),
  spaceId?: string,
): ProfilesFile {
  if (file.tabs.some((t) => t.id === newId) || file.favorites.some((f) => f.id === newId)) return file;
  const tab = file.tabs.find((t) => t.id === id);
  const fav = tab ? undefined : file.favorites.find((f) => f.id === id);
  const source = tab ?? fav;
  if (!source) return file;
  const targetSpace = tab ? tab.spaceId : spaceId;
  if (targetSpace === undefined || ownerOf(file, targetSpace) === undefined) return file;

  const copy: TabEntry = {
    id: newId,
    spaceId: targetSpace,
    section: 'today',
    url: source.url,
    title: source.title,
    order: 0,
    lastActiveAt: now,
    ...(source.favicon !== undefined ? { favicon: source.favicon } : {}),
  };
  const list = byOrder(file.tabs.filter((t) => t.section === 'today' && t.spaceId === targetSpace));
  const at = tab && tab.section === 'today' ? list.findIndex((t) => t.id === id) + 1 : list.length;
  list.splice(at, 0, copy);
  return { ...file, tabs: writeTabList(file.tabs, 'today', targetSpace, list) };
}

export interface CloseResult {
  file: ProfilesFile;
  reopen: TabEntry[];
}

/**
 * Close a tab. A pinned tab keeps its entry with `unloaded: true` (R15.3). A
 * Today tab is removed and appended to the reopen-closed-tab list (R12.9).
 */
export function closeTab(
  file: ProfilesFile,
  tabId: string,
  reopen: readonly TabEntry[] = [],
): CloseResult {
  const tab = file.tabs.find((t) => t.id === tabId);
  if (!tab) return { file, reopen: [...reopen] };
  if (tab.section === 'pinned') {
    return {
      file: { ...file, tabs: file.tabs.map((t) => (t.id === tabId ? { ...t, unloaded: true } : t)) },
      reopen: [...reopen],
    };
  }
  const list = byOrder(file.tabs.filter((t) => t.section === 'today' && t.spaceId === tab.spaceId && t.id !== tabId));
  return {
    file: {
      ...file,
      tabs: writeTabList(
        file.tabs.filter((t) => t.id !== tabId),
        'today',
        tab.spaceId,
        list,
      ),
    },
    reopen: [...reopen, tab],
  };
}
