// Profile data model persisted in `userData/neutrino-data/profiles.json`.
// Pure types: no Electron imports, so tests and pure modules can use them.
//
// App-wide UI preferences (sidebar expanded/auto-hide, RightPinsDock
// visibility, archive interval) are NOT stored here. They live in the
// settings object (`src/main/settings.ts`), so each value has one home.

/** Bump when the `ProfilesFile` shape changes; migration skips when equal. */
export const CURRENT_SCHEMA_VERSION = 1;

export interface Profile {
  /** `'default'` for the profile migrated from the legacy single session. */
  id: string;
  name: string;
  createdAt: number;
}

export interface SpaceRecord {
  id: string;
  /** Owning profile. Each space belongs to exactly one profile. */
  profileId: string;
  name: string;
  icon: string;
  color: string;
  order: number;
}

export type TabSection = 'pinned' | 'today';

export interface FolderRecord {
  id: string;
  /** Owning space. Folders exist within the pinned section of a space. */
  spaceId: string;
  name: string;
  order: number;
  collapsed?: boolean;
  icon?: string;
  color?: string;
}

export interface TabEntry {
  id: string;
  spaceId: string;
  section: TabSection;
  url: string;
  title: string;
  favicon?: string;
  order: number;
  /** Absolute epoch ms of last activation; survives restart. */
  lastActiveAt: number;
  /** A closed pinned tab keeps its entry with `unloaded: true`. */
  unloaded?: boolean;
  /** Folder within the pinned section; undefined for root pinned tabs. */
  folderId?: string;
}

export interface FavoriteEntry {
  id: string;
  profileId: string;
  url: string;
  title: string;
  favicon?: string;
  order: number;
}

export interface ArchivedTab {
  id: string;
  profileId: string;
  spaceId: string;
  url: string;
  title: string;
  favicon?: string;
  archivedAt: number;
}

export interface ProfilesFile {
  schemaVersion: number;
  /** Epoch ms when migration from `browser-state.json` wrote this file. */
  migratedAt?: number;
  profiles: Profile[];
  spaces: SpaceRecord[];
  tabs: TabEntry[];
  folders?: FolderRecord[];
  favorites: FavoriteEntry[];
  archive: ArchivedTab[];
  /** profileId -> origins the user chose "Never" save passwords for. */
  neverList: Record<string, string[]>;
}
