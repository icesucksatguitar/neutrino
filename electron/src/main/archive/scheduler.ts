// Decisions behind the auto-archive scheduler in index.ts (R16.3-R16.9).
// Pure: no Electron imports, no I/O, no timers. index.ts owns the interval and
// applies the returned files through BrowserManager / ProfileStore.

import { listArchive, prune, restore, selectTabsToArchive, type ArchiveSelectionContext, type RestoreResult } from './archiver';
import type { ArchivedTab, ProfilesFile, TabEntry } from '../profiles/types';

/** How often the scheduler re-checks the tabs. Intervals are hours, so a minute is precise enough. */
export const ARCHIVE_CHECK_MS = 60_000;

/** An archived tab as shown in the archive list, with the name of its space (null when deleted). */
export interface ArchiveListEntry extends ArchivedTab {
  spaceName: string | null;
}

export interface ArchivePlan {
  /** The file with the archived tabs removed from `tabs` and recorded in `archive`. */
  file: ProfilesFile;
  /** Ids of every tab to close (recorded or not). */
  closedIds: string[];
  /** Ids of the tabs recorded in the archive (each archive entry keeps its tab id). */
  archivedIds: string[];
}

/** Blank tabs carry nothing worth restoring; they are closed without an archive entry. */
function isBlankUrl(url: string): boolean {
  return !url || url === 'neutrino://newtab' || url === 'about:blank';
}

/** Builds the archive record of a tab. The record keeps the tab id. */
export function toArchivedTab(
  tab: Pick<TabEntry, 'id' | 'spaceId' | 'url' | 'title' | 'favicon'>,
  profileId: string,
  now: number,
): ArchivedTab {
  const entry: ArchivedTab = {
    id: tab.id,
    profileId,
    spaceId: tab.spaceId,
    url: tab.url,
    title: tab.title,
    archivedAt: now,
  };
  if (tab.favicon !== undefined) entry.favicon = tab.favicon;
  return entry;
}

/**
 * One scheduler pass: selects the Today tabs to archive (see
 * `selectTabsToArchive`), removes them from `tabs`, records the non-blank ones
 * in `archive` and prunes entries older than 30 days. Returns null when no tab
 * is due, so the caller does not rewrite the file.
 */
export function planArchive(file: ProfilesFile, ctx: ArchiveSelectionContext): ArchivePlan | null {
  const due = selectTabsToArchive(file.tabs, ctx);
  if (due.length === 0) return null;

  const owner = new Map(file.spaces.map((s) => [s.id, s.profileId]));
  const closed = new Set(due.map((t) => t.id));
  const records: ArchivedTab[] = [];
  for (const tab of due) {
    const profileId = owner.get(tab.spaceId);
    if (profileId === undefined || isBlankUrl(tab.url)) continue;
    records.push(toArchivedTab(tab, profileId, ctx.now));
  }
  const recorded = new Set(records.map((r) => r.id));
  const archive = prune(
    [...file.archive.filter((a) => !recorded.has(a.id)), ...records],
    ctx.now,
  );

  return {
    file: { ...file, tabs: file.tabs.filter((t) => !closed.has(t.id)), archive },
    closedIds: due.map((t) => t.id),
    archivedIds: records.map((r) => r.id),
  };
}

/**
 * Cheap pre-check on the live tabs, so a scheduler tick with nothing due does
 * not rewrite `profiles.json`. Same rule as `planArchive`.
 */
export function isArchiveDue(
  tabs: readonly Pick<TabEntry, 'id' | 'spaceId' | 'section' | 'lastActiveAt'>[],
  ctx: ArchiveSelectionContext,
): boolean {
  const entries: TabEntry[] = tabs.map((t) => ({
    id: t.id,
    spaceId: t.spaceId,
    section: t.section,
    lastActiveAt: t.lastActiveAt,
    url: '',
    title: '',
    order: 0,
  }));
  return selectTabsToArchive(entries, ctx).length > 0;
}

/** Prunes the archive on load (R16.9). Returns null when nothing expired. */
export function pruneFile(file: ProfilesFile, now: number): ProfilesFile | null {
  const archive = prune(file.archive, now);
  return archive.length === file.archive.length ? null : { ...file, archive };
}

/**
 * The active space of a profile: the app-wide active space when that profile
 * owns it, otherwise the profile's first space. Null for an unknown profile.
 */
export function activeSpaceOfProfile(file: ProfilesFile, profileId: string, activeSpaceId: string | null): string | null {
  const own = file.spaces.filter((s) => s.profileId === profileId);
  if (own.some((s) => s.id === activeSpaceId)) return activeSpaceId;
  const first = [...own].sort((a, b) => a.order - b.order)[0];
  return first ? first.id : null;
}

/**
 * Restores an archived tab (R16.8) into its original space, or into the active
 * space of the archived tab's own profile when the original space is gone, so
 * a restore never crosses into another profile. Null when the entry is unknown
 * or its profile has no space.
 */
export function restoreArchived(
  file: ProfilesFile,
  archivedId: string,
  activeSpaceId: string | null,
  now: number,
  newId?: () => string,
): RestoreResult | null {
  const entry = file.archive.find((a) => a.id === archivedId);
  if (!entry) return null;
  const fallback = activeSpaceOfProfile(file, entry.profileId, activeSpaceId);
  if (fallback === null) return null;
  return restore(file, archivedId, fallback, now, newId);
}

/** The profile's archive list, newest first, with space names (R16.7). */
export function archiveListView(file: ProfilesFile, profileId: string): ArchiveListEntry[] {
  const names = new Map(file.spaces.map((s) => [s.id, s.name]));
  return listArchive(file, profileId).map((entry) => ({ ...entry, spaceName: names.get(entry.spaceId) ?? null }));
}
