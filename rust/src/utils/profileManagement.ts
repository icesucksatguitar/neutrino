import type { Profile, Space, TabState } from '../types';

/** Shown when the user tries to delete the only profile (R1.9). */
export const LAST_PROFILE_MESSAGE = 'The last profile cannot be deleted.';
/** Shown when the user tries to delete a profile's only space (R13.9). */
export const LAST_SPACE_MESSAGE = 'Each profile needs at least one space.';

export const PROFILE_NAME_MAX = 40;
export const SPACE_NAME_MAX = 40;

/** What a profile deletion erases (R1.7, R1.8). Order is the order shown in the dialog. */
export const PROFILE_ERASE_ITEMS: readonly string[] = Object.freeze([
  'Open tabs',
  'Spaces',
  'Favorites and archived tabs',
  'Session data: cookies, site storage, cache and logins',
  'Browsing history',
  'Saved passwords and the never-save list',
]);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Headline of the profile deletion dialog. `tabCount` is omitted when the
 * caller does not know the tabs.
 */
export function profileEraseSummary(name: string, spaceCount: number, tabCount?: number): string {
  const parts = [plural(spaceCount, 'space')];
  if (typeof tabCount === 'number') parts.push(plural(tabCount, 'tab'));
  return `Delete "${name}"? This closes ${parts.join(' and ')} and permanently erases:`;
}

export type DeleteGuard = { allowed: true } | { allowed: false; message: string };

/** The last remaining profile cannot be deleted (R1.9). */
export function profileDeleteGuard(profiles: readonly Profile[], profileId: string): DeleteGuard {
  if (!profiles.some((p) => p.id === profileId)) return { allowed: false, message: 'This profile no longer exists.' };
  if (profiles.length <= 1) return { allowed: false, message: LAST_PROFILE_MESSAGE };
  return { allowed: true };
}

export type SpaceDeleteDecision =
  | { kind: 'blocked'; message: string }
  | { kind: 'confirm'; tabCount: number | null }
  | { kind: 'delete' };

/**
 * A profile's only space cannot be deleted (R13.9); a space with tabs needs
 * confirmation first (R13.8). With `tabs` unknown, confirmation is always asked.
 */
export function spaceDeleteDecision(
  spaces: readonly Space[],
  spaceId: string,
  tabs?: readonly TabState[],
): SpaceDeleteDecision {
  const space = spaces.find((s) => s.id === spaceId);
  if (!space) return { kind: 'blocked', message: 'This space no longer exists.' };
  const siblings = spaces.filter((s) => s.profileId === space.profileId);
  if (siblings.length <= 1) return { kind: 'blocked', message: LAST_SPACE_MESSAGE };
  if (!tabs) return { kind: 'confirm', tabCount: null };
  const tabCount = tabs.filter((t) => t.spaceId === spaceId).length;
  return tabCount > 0 ? { kind: 'confirm', tabCount } : { kind: 'delete' };
}

export function spaceDeleteConfirmText(name: string, tabCount: number | null): string {
  const what = tabCount === null ? 'its tabs' : plural(tabCount, 'tab');
  return `Delete space "${name}"? This closes ${what}.`;
}

/** Owner for a new space: the selected profile if it exists, else the active one (R1.11). */
export function defaultSpaceOwner(
  profiles: readonly Profile[],
  activeProfileId: string | null,
  selected?: string | null,
): string | null {
  if (selected && profiles.some((p) => p.id === selected)) return selected;
  if (activeProfileId && profiles.some((p) => p.id === activeProfileId)) return activeProfileId;
  return profiles[0]?.id ?? null;
}

/** Trimmed name, or null when empty. */
export function cleanName(raw: string, max: number): string | null {
  const trimmed = raw.trim().slice(0, max).trim();
  return trimmed ? trimmed : null;
}

/** User-facing text for profile/space IPC error codes. */
export function describeManagementError(code: string): string {
  switch (code) {
    case 'last-profile':
      return LAST_PROFILE_MESSAGE;
    case 'last-space':
      return LAST_SPACE_MESSAGE;
    case 'unknown-profile':
      return 'This profile no longer exists.';
    case 'erase-failed':
      return 'Some of this profile\u2019s data could not be erased. Try again.';
    case 'unavailable':
      return 'Profiles are not available right now.';
    default:
      return 'Something went wrong. Try again.';
  }
}
