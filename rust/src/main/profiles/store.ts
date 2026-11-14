// ProfileStore: profiles, spaces, tabs, favorites, archive and never-lists,
// held in memory and persisted as one `profiles.json` through injected I/O.
// Pure over its I/O: no Electron imports, so tests pass fakes.
//
// Invariants kept by every operation:
// - at least one profile exists;
// - every space references exactly one existing profile;
// - every profile owns at least one space;
// - there is always an active space.

import { randomUUID } from 'crypto';
import { DEFAULT_PROFILE_ID, partitionForProfile } from './partition';
import {
  CURRENT_SCHEMA_VERSION,
  type ArchivedTab,
  type FavoriteEntry,
  type FolderRecord,
  type Profile,
  type ProfilesFile,
  type SpaceRecord,
  type TabEntry,
} from './types';

export interface ProfileStoreIO {
  /** Returns the stored file, or null when none exists yet. */
  read(): ProfilesFile | null;
  /** Persists the whole file (the caller is expected to write atomically). */
  write(file: ProfilesFile): void;
  /** Erases a profile session's storage (cookies, cache, IndexedDB, ...). */
  clearSession(partition: string): Promise<void>;
  /** Deletes the profile's per-profile files (history, vault). */
  rmFiles(profileId: string): void;
  /** Optional id generator (tests inject a deterministic one). */
  newId?: () => string;
  /** Optional clock (epoch ms). */
  now?: () => number;
}

export interface SpacePatch {
  name?: string;
  color?: string;
  icon?: string;
  /** Target index within the owning profile's spaces (reorder). */
  order?: number;
}

const DEFAULT_SPACE = { name: 'Home', icon: 'Home', color: '#A1A1AA' };

// ---------------------------------------------------------------------------
// Serialization (pure)
// ---------------------------------------------------------------------------

export function serializeProfilesFile(file: ProfilesFile): string {
  return JSON.stringify(file, null, 2);
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function parseProfile(v: unknown): Profile | null {
  if (!isObj(v) || !isStr(v.id) || !isStr(v.name) || !isNum(v.createdAt)) return null;
  return { id: v.id, name: v.name, createdAt: v.createdAt };
}

function parseSpace(v: unknown): SpaceRecord | null {
  if (
    !isObj(v) || !isStr(v.id) || !isStr(v.profileId) || !isStr(v.name) ||
    !isStr(v.icon) || !isStr(v.color) || !isNum(v.order)
  ) return null;
  return {
    id: v.id, profileId: v.profileId, name: v.name,
    icon: v.icon, color: v.color, order: v.order,
  };
}

function parseTab(v: unknown): TabEntry | null {
  if (
    !isObj(v) || !isStr(v.id) || !isStr(v.spaceId) ||
    (v.section !== 'pinned' && v.section !== 'today') ||
    !isStr(v.url) || !isStr(v.title) || !isNum(v.order) || !isNum(v.lastActiveAt)
  ) return null;
  const tab: TabEntry = {
    id: v.id, spaceId: v.spaceId, section: v.section, url: v.url,
    title: v.title, order: v.order, lastActiveAt: v.lastActiveAt,
  };
  if (isStr(v.favicon)) tab.favicon = v.favicon;
  if (typeof v.unloaded === 'boolean') tab.unloaded = v.unloaded;
  if (isStr(v.folderId)) tab.folderId = v.folderId;
  return tab;
}

function parseFolder(v: unknown): FolderRecord | null {
  if (
    !isObj(v) || !isStr(v.id) || !isStr(v.spaceId) ||
    !isStr(v.name) || !isNum(v.order)
  ) return null;
  const folder: FolderRecord = {
    id: v.id,
    spaceId: v.spaceId,
    name: v.name,
    order: v.order,
  };
  if (typeof v.collapsed === 'boolean') folder.collapsed = v.collapsed;
  if (isStr(v.icon)) folder.icon = v.icon;
  if (isStr(v.color)) folder.color = v.color;
  return folder;
}

function parseFavorite(v: unknown): FavoriteEntry | null {
  if (
    !isObj(v) || !isStr(v.id) || !isStr(v.profileId) || !isStr(v.url) ||
    !isStr(v.title) || !isNum(v.order)
  ) return null;
  const fav: FavoriteEntry = {
    id: v.id, profileId: v.profileId, url: v.url, title: v.title, order: v.order,
  };
  if (isStr(v.favicon)) fav.favicon = v.favicon;
  return fav;
}

function parseArchived(v: unknown): ArchivedTab | null {
  if (
    !isObj(v) || !isStr(v.id) || !isStr(v.profileId) || !isStr(v.spaceId) ||
    !isStr(v.url) || !isStr(v.title) || !isNum(v.archivedAt)
  ) return null;
  const a: ArchivedTab = {
    id: v.id, profileId: v.profileId, spaceId: v.spaceId,
    url: v.url, title: v.title, archivedAt: v.archivedAt,
  };
  if (isStr(v.favicon)) a.favicon = v.favicon;
  return a;
}

function parseList<T>(v: unknown, parse: (x: unknown) => T | null): T[] {
  if (!Array.isArray(v)) return [];
  const out: T[] = [];
  for (const item of v) {
    const parsed = parse(item);
    if (parsed) out.push(parsed);
  }
  return out;
}

/**
 * Parses `profiles.json` text. Returns null when the text is not JSON or has
 * no `profiles` array. Malformed records are dropped; valid ones round-trip
 * exactly through `serializeProfilesFile`.
 */
export function parseProfilesFile(text: string): ProfilesFile | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(raw) || !Array.isArray(raw.profiles)) return null;

  const neverList: Record<string, string[]> = {};
  if (isObj(raw.neverList)) {
    for (const [profileId, origins] of Object.entries(raw.neverList)) {
      if (Array.isArray(origins)) neverList[profileId] = origins.filter(isStr);
    }
  }

  const file: ProfilesFile = {
    schemaVersion: isNum(raw.schemaVersion) ? raw.schemaVersion : CURRENT_SCHEMA_VERSION,
    profiles: parseList(raw.profiles, parseProfile),
    spaces: parseList(raw.spaces, parseSpace),
    tabs: parseList(raw.tabs, parseTab),
    favorites: parseList(raw.favorites, parseFavorite),
    archive: parseList(raw.archive, parseArchived),
    neverList,
  };
  if (Array.isArray(raw.folders)) file.folders = parseList(raw.folders, parseFolder);
  if (isNum(raw.migratedAt)) file.migratedAt = raw.migratedAt;
  return file;
}

/** Deep copy through the serializer, so stored and returned state never alias. */
function cloneFile(file: ProfilesFile): ProfilesFile {
  const copy = parseProfilesFile(serializeProfilesFile(file));
  if (!copy) throw new Error('ProfileStore: state failed to round-trip');
  return copy;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class ProfileStore {
  private state: ProfilesFile;
  private activeSpace: string;
  private readonly newId: () => string;
  private readonly now: () => number;

  constructor(private readonly io: ProfileStoreIO) {
    this.newId = io.newId ?? (() => randomUUID());
    this.now = io.now ?? (() => Date.now());

    const loaded = io.read();
    const { file, repaired } = this.repair(loaded ? cloneFile(loaded) : null);
    this.state = file;
    this.activeSpace = this.sortedSpaces()[0].id;
    if (repaired) this.persist();
  }

  // ----- queries -----------------------------------------------------------

  /** Deep copy of the current file. */
  snapshot(): ProfilesFile {
    return cloneFile(this.state);
  }

  /** Profiles in creation order. */
  listProfiles(): Profile[] {
    return this.state.profiles.map((p) => ({ ...p }));
  }

  /** Spaces grouped by profile (creation order), each group by `order`. */
  listSpaces(profileId?: string): SpaceRecord[] {
    return this.sortedSpaces()
      .filter((s) => profileId === undefined || s.profileId === profileId)
      .map((s) => ({ ...s }));
  }

  ownerOf(spaceId: string): string {
    return this.requireSpace(spaceId).profileId;
  }

  partitionForSpace(spaceId: string): string {
    return partitionForProfile(this.ownerOf(spaceId));
  }

  activeSpaceId(): string {
    return this.activeSpace;
  }

  activeProfileId(): string {
    return this.ownerOf(this.activeSpace);
  }

  // ----- profiles ----------------------------------------------------------

  createProfile(name: string): { profile: Profile; space: SpaceRecord } {
    const profile: Profile = {
      id: this.freshId('', (id) => id !== DEFAULT_PROFILE_ID && !this.findProfile(id)),
      name: cleanName(name, 'Profile'),
      createdAt: this.now(),
    };
    this.state.profiles.push(profile);
    const space = this.addSpace(DEFAULT_SPACE.name, profile.id);
    this.persist();
    return { profile: { ...profile }, space: { ...space } };
  }

  renameProfile(id: string, name: string): void {
    const profile = this.findProfile(id);
    if (!profile) throw new Error(`Unknown profile: ${id}`);
    profile.name = cleanName(name, profile.name);
    this.persist();
  }

  /**
   * Erases the profile: its spaces, tabs, favorites, archive and never-list
   * are removed and persisted first, then its session storage and per-profile
   * files are erased. Rejects (state unchanged) for the only profile.
   */
  async deleteProfile(id: string): Promise<void> {
    if (!this.findProfile(id)) throw new Error(`Unknown profile: ${id}`);
    if (this.state.profiles.length <= 1) {
      throw new Error('The last profile cannot be deleted');
    }

    const spaceIds = new Set(
      this.state.spaces.filter((s) => s.profileId === id).map((s) => s.id),
    );
    const s = this.state;
    s.profiles = s.profiles.filter((p) => p.id !== id);
    s.spaces = s.spaces.filter((sp) => sp.profileId !== id);
    s.folders = (s.folders || []).filter((f) => !spaceIds.has(f.spaceId));
    s.tabs = s.tabs.filter((t) => !spaceIds.has(t.spaceId));
    s.favorites = s.favorites.filter((f) => f.profileId !== id);
    s.archive = s.archive.filter((a) => a.profileId !== id);
    delete s.neverList[id];
    if (spaceIds.has(this.activeSpace)) this.activeSpace = this.sortedSpaces()[0].id;
    this.persist();

    try {
      await this.io.clearSession(partitionForProfile(id));
    } finally {
      this.io.rmFiles(id);
    }
  }

  // ----- spaces ------------------------------------------------------------

  /** Creates a space owned by `profileId`, defaulting to the active profile. */
  createSpace(name: string, profileId?: string): SpaceRecord {
    const owner = profileId ?? this.activeProfileId();
    if (!this.findProfile(owner)) throw new Error(`Unknown profile: ${owner}`);
    const space = this.addSpace(cleanName(name, DEFAULT_SPACE.name), owner);
    this.persist();
    return { ...space };
  }

  /** Deletes a space and its tabs. Rejects for the only space of a profile. */
  deleteSpace(id: string): void {
    const space = this.requireSpace(id);
    if (this.spacesOf(space.profileId).length <= 1) {
      throw new Error('Each profile needs at least one space');
    }
    this.state.spaces = this.state.spaces.filter((s) => s.id !== id);
    this.state.folders = (this.state.folders || []).filter((f) => f.spaceId !== id);
    this.state.tabs = this.state.tabs.filter((t) => t.spaceId !== id);
    this.renumber(space.profileId);
    if (this.activeSpace === id) this.activeSpace = this.spacesOf(space.profileId)[0].id;
    this.persist();
  }

  /** Rename, recolor, change icon, and/or reorder within the owning profile. */
  updateSpace(id: string, patch: SpacePatch): SpaceRecord {
    const space = this.requireSpace(id);
    if (patch.name !== undefined) space.name = cleanName(patch.name, space.name);
    if (patch.color !== undefined) space.color = patch.color;
    if (patch.icon !== undefined) space.icon = patch.icon;
    if (patch.order !== undefined) {
      const siblings = this.spacesOf(space.profileId).filter((s) => s.id !== id);
      const index = clampIndex(patch.order, siblings.length);
      siblings.splice(index, 0, space);
      siblings.forEach((s, i) => { s.order = i; });
    }
    this.persist();
    return { ...space };
  }

  /**
   * Moves a space (with its tabs) to another profile, appended last there.
   * Rejects when it is the only space of its current profile.
   */
  moveSpace(id: string, toProfileId: string): SpaceRecord {
    const space = this.requireSpace(id);
    if (!this.findProfile(toProfileId)) throw new Error(`Unknown profile: ${toProfileId}`);
    if (space.profileId === toProfileId) return { ...space };
    if (this.spacesOf(space.profileId).length <= 1) {
      throw new Error('Each profile needs at least one space');
    }
    const from = space.profileId;
    space.order = this.nextOrder(toProfileId);
    space.profileId = toProfileId;
    this.renumber(from);
    this.persist();
    return { ...space };
  }

  // ----- folders -----------------------------------------------------------

  listFolders(spaceId?: string): FolderRecord[] {
    const folders = this.state.folders || [];
    return folders
      .filter((f) => spaceId === undefined || f.spaceId === spaceId)
      .sort((a, b) => a.order - b.order)
      .map((f) => ({ ...f }));
  }

  createFolder(spaceId: string, name: string): FolderRecord {
    this.requireSpace(spaceId);
    if (!this.state.folders) this.state.folders = [];
    const existing = this.state.folders.filter((f) => f.spaceId === spaceId);
    const order = existing.reduce((max, f) => Math.max(max, f.order + 1), 0);
    const folder: FolderRecord = {
      id: this.freshId('folder-', (id) => !this.state.folders!.some((f) => f.id === id)),
      spaceId,
      name: cleanName(name, 'New Folder'),
      order,
      collapsed: false,
    };
    this.state.folders.push(folder);
    this.persist();
    return { ...folder };
  }

  updateFolder(id: string, patch: Partial<FolderRecord>): FolderRecord {
    if (!this.state.folders) this.state.folders = [];
    const folder = this.state.folders.find((f) => f.id === id);
    if (!folder) throw new Error(`Unknown folder: ${id}`);
    if (patch.name !== undefined) folder.name = cleanName(patch.name, folder.name);
    if (patch.collapsed !== undefined) folder.collapsed = Boolean(patch.collapsed);
    if (patch.icon !== undefined) folder.icon = patch.icon;
    if (patch.color !== undefined) folder.color = patch.color;
    if (patch.order !== undefined && Number.isFinite(patch.order)) {
      const siblings = this.state.folders
        .filter((f) => f.spaceId === folder.spaceId && f.id !== id)
        .sort((a, b) => a.order - b.order);
      const index = clampIndex(patch.order, siblings.length);
      siblings.splice(index, 0, folder);
      siblings.forEach((f, idx) => { f.order = idx; });
    }
    this.persist();
    return { ...folder };
  }

  deleteFolder(id: string): boolean {
    if (!this.state.folders) return false;
    const idx = this.state.folders.findIndex((f) => f.id === id);
    if (idx === -1) return false;
    this.state.folders.splice(idx, 1);
    for (const tab of this.state.tabs) {
      if (tab.folderId === id) {
        delete tab.folderId;
      }
    }
    this.persist();
    return true;
  }

  setActiveSpace(id: string): void {
    this.requireSpace(id);
    this.activeSpace = id;
  }

  /**
   * Applies a pure transform to the file (layout, archive and never-list
   * operations) and persists it. The result must keep the store invariants.
   */
  update(fn: (file: ProfilesFile) => ProfilesFile): void {
    const next = cloneFile(fn(this.snapshot()));
    const problem = invariantViolation(next);
    if (problem) throw new Error(`ProfileStore.update: ${problem}`);
    this.state = next;
    if (!this.state.spaces.some((s) => s.id === this.activeSpace)) {
      this.activeSpace = this.sortedSpaces()[0].id;
    }
    this.persist();
  }

  // ----- internals ---------------------------------------------------------

  private persist(): void {
    this.io.write(cloneFile(this.state));
  }

  private findProfile(id: string): Profile | undefined {
    return this.state.profiles.find((p) => p.id === id);
  }

  private requireSpace(id: string): SpaceRecord {
    const space = this.state.spaces.find((s) => s.id === id);
    if (!space) throw new Error(`Unknown space: ${id}`);
    return space;
  }

  /** Live (mutable) spaces of one profile, sorted by order. */
  private spacesOf(profileId: string): SpaceRecord[] {
    return this.state.spaces
      .filter((s) => s.profileId === profileId)
      .sort((a, b) => a.order - b.order);
  }

  private sortedSpaces(): SpaceRecord[] {
    return this.state.profiles.flatMap((p) => this.spacesOf(p.id));
  }

  private nextOrder(profileId: string): number {
    return this.spacesOf(profileId).reduce((m, s) => Math.max(m, s.order + 1), 0);
  }

  private renumber(profileId: string): void {
    this.spacesOf(profileId).forEach((s, i) => { s.order = i; });
  }

  private addSpace(name: string, profileId: string): SpaceRecord {
    const space: SpaceRecord = {
      id: this.freshId('space-', (id) => !this.state.spaces.some((s) => s.id === id)),
      profileId,
      name,
      icon: DEFAULT_SPACE.icon,
      color: DEFAULT_SPACE.color,
      order: this.nextOrder(profileId),
    };
    this.state.spaces.push(space);
    return space;
  }

  private freshId(prefix: string, isFree: (id: string) => boolean): string {
    for (let i = 0; i < 100; i++) {
      const id = `${prefix}${this.newId()}`;
      if (isFree(id)) return id;
    }
    throw new Error('ProfileStore: could not generate a unique id');
  }

  /**
   * Restores the invariants on loaded data: creates a Default profile when
   * there is none, reassigns orphan spaces to the first profile, and gives
   * every space-less profile one space.
   */
  private repair(loaded: ProfilesFile | null): { file: ProfilesFile; repaired: boolean } {
    let repaired = false;
    const file: ProfilesFile = loaded ?? {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      profiles: [], spaces: [], tabs: [], folders: [], favorites: [], archive: [], neverList: {},
    };
    if (!loaded) repaired = true;
    if (!file.folders) {
      file.folders = [];
    } else {
      const spaceIds = new Set(file.spaces.map((s) => s.id));
      const validFolders = file.folders.filter((f) => spaceIds.has(f.spaceId));
      if (validFolders.length !== file.folders.length) {
        file.folders = validFolders;
        repaired = true;
      }
    }
    this.state = file;

    if (file.profiles.length === 0) {
      file.profiles.push({ id: DEFAULT_PROFILE_ID, name: 'Default', createdAt: this.now() });
      repaired = true;
    }
    const ids = new Set(file.profiles.map((p) => p.id));
    for (const space of file.spaces) {
      if (!ids.has(space.profileId)) {
        space.profileId = file.profiles[0].id;
        space.order = Number.MAX_SAFE_INTEGER;
        this.renumber(space.profileId);
        repaired = true;
      }
    }
    for (const profile of file.profiles) {
      if (this.spacesOf(profile.id).length === 0) {
        this.addSpace(DEFAULT_SPACE.name, profile.id);
        repaired = true;
      }
    }
    return { file, repaired };
  }
}

/** Returns a description of the first broken store invariant, or null. */
export function invariantViolation(file: ProfilesFile): string | null {
  if (file.profiles.length === 0) return 'no profiles';
  const profileIds = new Set(file.profiles.map((p) => p.id));
  if (profileIds.size !== file.profiles.length) return 'duplicate profile id';
  const spaceIds = new Set(file.spaces.map((s) => s.id));
  if (spaceIds.size !== file.spaces.length) return 'duplicate space id';
  const owners = new Set<string>();
  for (const space of file.spaces) {
    if (!profileIds.has(space.profileId)) return `space ${space.id} has no profile`;
    owners.add(space.profileId);
  }
  for (const id of profileIds) {
    if (!owners.has(id)) return `profile ${id} has no space`;
  }
  return null;
}

function cleanName(name: string, fallback: string): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return trimmed || fallback;
}

function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) return length;
  return Math.max(0, Math.min(length, Math.trunc(index)));
}
