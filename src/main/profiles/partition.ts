// Profile -> Electron session partition mapping. Pure: no Electron imports.
//
// The Default profile keeps the legacy `persist:neutrino` partition so
// existing cookies, logins and site data survive migration. Every other
// profile gets its own persistent partition, isolating its storage.

export const DEFAULT_PROFILE_ID = 'default';
export const DEFAULT_PARTITION = 'persist:neutrino';

const PROFILE_PARTITION_PREFIX = 'persist:profile-';

export function partitionForProfile(profileId: string): string {
  return profileId === DEFAULT_PROFILE_ID
    ? DEFAULT_PARTITION
    : `${PROFILE_PARTITION_PREFIX}${profileId}`;
}
