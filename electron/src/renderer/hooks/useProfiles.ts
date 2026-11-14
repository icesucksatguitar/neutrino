import { useCallback, useEffect, useMemo, useState } from 'react';
import type { IpcResult, Profile, Space } from '../types';

export interface ProfileGroup {
  profile: Profile;
  spaces: Space[];
}

/**
 * Space_Switcher grouping: profiles in creation order, each with its spaces by
 * `order` (R13.1). Spaces whose owner is unknown are dropped.
 */
export function groupSpacesByProfile(profiles: readonly Profile[], spaces: readonly Space[]): ProfileGroup[] {
  return [...profiles]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((profile) => ({
      profile,
      spaces: spaces
        .filter((s) => s.profileId === profile.id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    }));
}

const NO_BRIDGE: IpcResult = { ok: false, error: 'unavailable' };

/**
 * Profiles as seen by the renderer. The list follows `state-update` (sent after
 * every profile/space change) and is seeded once from `listProfiles`, which
 * also carries each profile's session partition.
 */
export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const list = await window.neutrino?.listProfiles?.();
    if (!list) return;
    setProfiles(list.profiles);
    setSpaces(list.spaces);
    setActiveProfileId(list.activeProfileId);
  }, []);

  useEffect(() => {
    if (!window.neutrino) return;
    refresh().catch(() => { });
    const unreg = window.neutrino.onStateUpdate((state) => {
      if (Array.isArray(state.profiles)) {
        const incoming = state.profiles;
        // state-update omits `partition`; keep the one listProfiles gave us.
        setProfiles((prev) =>
          incoming.map((p) => ({ ...prev.find((old) => old.id === p.id), ...p })),
        );
      }
      if (Array.isArray(state.spaces)) setSpaces(state.spaces);
      if (typeof state.activeProfileId === 'string') setActiveProfileId(state.activeProfileId);
    });
    return () => unreg?.();
  }, [refresh]);

  const createProfile = useCallback(async (name?: string) => {
    const res = (await window.neutrino?.createProfile?.(name)) ?? NO_BRIDGE;
    if (res.ok) await refresh();
    return res;
  }, [refresh]);

  const renameProfile = useCallback(async (profileId: string, name: string) => {
    const res = (await window.neutrino?.renameProfile?.(profileId, name)) ?? NO_BRIDGE;
    if (res.ok) await refresh();
    return res;
  }, [refresh]);

  /** The caller confirms first (R1.7); `last-profile` means the deletion was refused (R1.9). */
  const deleteProfile = useCallback(async (profileId: string) => {
    const res = (await window.neutrino?.deleteProfile?.(profileId)) ?? NO_BRIDGE;
    await refresh();
    return res;
  }, [refresh]);

  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? null;
  const groups = useMemo(() => groupSpacesByProfile(profiles, spaces), [profiles, spaces]);

  return {
    profiles,
    spaces,
    groups,
    activeProfileId,
    activeProfile,
    canDeleteProfile: profiles.length > 1,
    refresh,
    createProfile,
    renameProfile,
    deleteProfile,
  };
}
