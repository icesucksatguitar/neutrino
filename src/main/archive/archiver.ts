// Auto-archive core (R15.6, R16). Pure: no Electron imports, no I/O.
// The scheduler that closes tabs and persists the archive lives elsewhere and
// calls into these functions.

import type { ArchiveIntervalHours } from '../settings';
import type { ArchivedTab, ProfilesFile, TabEntry } from '../profiles/types';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Archived tabs are kept for 30 days after their archive time (R16.9). */
export const ARCHIVE_RETENTION_MS = 30 * DAY_MS;

export interface ArchiveSelectionContext {
  now: number;
  /** `null` means the interval is "never": nothing is archived (R16.6). */
  intervalMs: number | null;
  activeTabId: string | null;
  audioTabIds: ReadonlySet<string>;
}

/** Converts the settings value to milliseconds; `'never'` maps to `null`. */
export function intervalToMs(setting: ArchiveIntervalHours): number | null {
  if (setting === 'never') return null;
  return setting * HOUR_MS;
}

/**
 * Returns the Today tabs that should be archived: inactive for longer than the
 * interval (measured from `lastActiveAt`, so time while the app was closed
 * counts, R16.4), not the active tab and not playing audio (R16.5). Pinned tabs
 * are never selected (R15.6); favorites are not `TabEntry` records at all.
 */
export function selectTabsToArchive(tabs: readonly TabEntry[], ctx: ArchiveSelectionContext): TabEntry[] {
  const { now, intervalMs, activeTabId, audioTabIds } = ctx;
  if (intervalMs === null || !Number.isFinite(intervalMs)) return [];
  return tabs.filter(
    (tab) =>
      tab.section === 'today' &&
      tab.id !== activeTabId &&
      !audioTabIds.has(tab.id) &&
      now - tab.lastActiveAt > intervalMs,
  );
}

/** Keeps entries archived within the last 30 days (inclusive). Idempotent. */
export function prune(archive: readonly ArchivedTab[], now: number): ArchivedTab[] {
  return archive.filter((entry) => now - entry.archivedAt <= ARCHIVE_RETENTION_MS);
}

/** The profile's archived tabs, newest first (R16.7). Ties are ordered by id. */
export function listArchive(file: ProfilesFile, profileId: string): ArchivedTab[] {
  return file.archive
    .filter((entry) => entry.profileId === profileId)
    .sort((a, b) => b.archivedAt - a.archivedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export interface RestoreResult {
  file: ProfilesFile;
  tab: TabEntry;
}

function defaultNewId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Restores an archived tab as a new Today tab (R16.8). The tab goes to its
 * original space when that space still exists in the same profile, otherwise
 * to `activeSpaceId`. The archive entry is removed and the new tab is appended
 * to the end of the target space's Today list. Returns `null` (input untouched)
 * when the entry does not exist or no valid target space is available.
 */
export function restore(
  file: ProfilesFile,
  archivedId: string,
  activeSpaceId: string | null,
  now: number,
  newId: () => string = defaultNewId,
): RestoreResult | null {
  const entry = file.archive.find((a) => a.id === archivedId);
  if (!entry) return null;

  const original = file.spaces.find((s) => s.id === entry.spaceId && s.profileId === entry.profileId);
  const targetSpaceId = original
    ? original.id
    : file.spaces.some((s) => s.id === activeSpaceId)
      ? activeSpaceId
      : null;
  if (targetSpaceId === null) return null;

  const todayOrders = file.tabs
    .filter((t) => t.spaceId === targetSpaceId && t.section === 'today')
    .map((t) => t.order);
  const order = todayOrders.length > 0 ? Math.max(...todayOrders) + 1 : 0;

  const tab: TabEntry = {
    id: newId(),
    spaceId: targetSpaceId,
    section: 'today',
    url: entry.url,
    title: entry.title,
    ...(entry.favicon !== undefined ? { favicon: entry.favicon } : {}),
    order,
    lastActiveAt: now,
  };

  return {
    file: {
      ...file,
      tabs: [...file.tabs, tab],
      archive: file.archive.filter((a) => a.id !== archivedId),
    },
    tab,
  };
}
