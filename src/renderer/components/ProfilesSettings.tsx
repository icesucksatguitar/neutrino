import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useProfiles } from '../hooks/useProfiles';
import type { Profile, Space, TabState } from '../types';
import {
  PROFILE_ERASE_ITEMS,
  PROFILE_NAME_MAX,
  SPACE_NAME_MAX,
  cleanName,
  defaultSpaceOwner,
  describeManagementError,
  profileDeleteGuard,
  profileEraseSummary,
  spaceDeleteConfirmText,
  spaceDeleteDecision,
} from '../utils/profileManagement';

export interface ProfilesSettingsProps {
  /** Open tabs, used to count what a deletion closes. Unknown -> space deletion always confirms. */
  tabs?: TabState[];
}

type Pending =
  | { kind: 'profile'; profile: Profile; spaceCount: number; tabCount?: number }
  | { kind: 'space'; space: Space; tabCount: number | null };

interface RenameRowProps {
  profile: Profile;
  onRename: (name: string) => void;
}

const ProfileNameInput: React.FC<RenameRowProps> = ({ profile, onRename }) => {
  const [draft, setDraft] = useState(profile.name);
  useEffect(() => setDraft(profile.name), [profile.name]);
  const commit = () => {
    const name = cleanName(draft, PROFILE_NAME_MAX);
    if (!name) {
      setDraft(profile.name);
      return;
    }
    setDraft(name);
    if (name !== profile.name) onRename(name);
  };
  return (
    <input
      className="settings-input settings-profile-name"
      type="text"
      aria-label={`Rename profile ${profile.name}`}
      value={draft}
      maxLength={PROFILE_NAME_MAX}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
      }}
    />
  );
};

/** Profiles & spaces management (R1.5-1.11, R13.7-13.9). Own heading class: see SettingsPanel. */
export const ProfilesSettings: React.FC<ProfilesSettingsProps> = ({ tabs }) => {
  const { profiles, spaces, groups, activeProfileId, refresh, createProfile, renameProfile, deleteProfile } =
    useProfiles();

  const [newProfileName, setNewProfileName] = useState('');
  const [newSpaceName, setNewSpaceName] = useState('');
  const [spaceOwner, setSpaceOwner] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const owner = defaultSpaceOwner(profiles, activeProfileId, spaceOwner);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch {
      setMessage(describeManagementError('failed'));
    } finally {
      setBusy(false);
    }
  };

  const submitProfile = () =>
    run(async () => {
      const name = cleanName(newProfileName, PROFILE_NAME_MAX);
      if (!name) return;
      const res = await createProfile(name);
      if (res.ok) {
        setNewProfileName('');
        setMessage(null);
      } else setMessage(describeManagementError(res.error));
    });

  const rename = (profileId: string, name: string) =>
    run(async () => {
      const res = await renameProfile(profileId, name);
      setMessage(res.ok ? null : describeManagementError(res.error));
    });

  const requestProfileDelete = (profile: Profile) => {
    const guard = profileDeleteGuard(profiles, profile.id);
    if (!guard.allowed) {
      setPending(null);
      setMessage(guard.message);
      return;
    }
    const owned = spaces.filter((s) => s.profileId === profile.id);
    const ownedIds = new Set(owned.map((s) => s.id));
    setMessage(null);
    setPending({
      kind: 'profile',
      profile,
      spaceCount: owned.length,
      tabCount: tabs ? tabs.filter((t) => ownedIds.has(t.spaceId)).length : undefined,
    });
  };

  const deleteSpaceNow = (spaceId: string) =>
    run(async () => {
      const res = await window.neutrino?.deleteSpace?.(spaceId);
      if (!res) setMessage(describeManagementError('unavailable'));
      else setMessage(res.ok ? null : describeManagementError(res.error));
      await refresh();
    });

  const requestSpaceDelete = (space: Space) => {
    const decision = spaceDeleteDecision(spaces, space.id, tabs);
    if (decision.kind === 'blocked') {
      setPending(null);
      setMessage(decision.message);
    } else if (decision.kind === 'confirm') {
      setMessage(null);
      setPending({ kind: 'space', space, tabCount: decision.tabCount });
    } else {
      setPending(null);
      deleteSpaceNow(space.id);
    }
  };

  const confirmPending = () => {
    const p = pending;
    setPending(null);
    if (!p) return;
    if (p.kind === 'space') {
      deleteSpaceNow(p.space.id);
      return;
    }
    run(async () => {
      const res = await deleteProfile(p.profile.id);
      setMessage(res.ok ? null : describeManagementError(res.error));
    });
  };

  const submitSpace = () =>
    run(async () => {
      const name = cleanName(newSpaceName, SPACE_NAME_MAX);
      if (!name || !owner) return;
      const created = await window.neutrino?.createSpace?.(name, undefined, owner);
      if (created) {
        setNewSpaceName('');
        setMessage(null);
        await refresh();
      } else setMessage(describeManagementError(created === null ? 'unknown-profile' : 'unavailable'));
    });

  return (
    <section className="settings-section settings-profiles" aria-label="Profiles and spaces">
      <h3 className="settings-group-title">Profiles &amp; spaces</h3>

      <ul className="settings-profile-list">
        {groups.map(({ profile, spaces: owned }) => (
          <li key={profile.id} className="settings-profile-item">
            <div className="settings-row">
              <ProfileNameInput profile={profile} onRename={(name) => rename(profile.id, name)} />
              {profile.id === activeProfileId && <span className="settings-hint">Active</span>}
              <button
                type="button"
                className="settings-button settings-button-danger"
                aria-label={`Delete profile ${profile.name}`}
                disabled={busy}
                onClick={() => requestProfileDelete(profile)}
              >
                <Trash2 size={13} aria-hidden="true" />
                Delete
              </button>
            </div>
            <ul className="settings-space-list">
              {owned.map((space) => (
                <li key={space.id} className="settings-row settings-space-item">
                  <span className="settings-space-name">
                    <span className="settings-space-dot" style={{ backgroundColor: space.color }} aria-hidden="true" />
                    {space.name}
                  </span>
                  <button
                    type="button"
                    className="settings-icon-button"
                    aria-label={`Delete space ${space.name}`}
                    title="Delete space"
                    disabled={busy}
                    onClick={() => requestSpaceDelete(space)}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      {pending && (
        <div className="settings-confirm" role="alertdialog" aria-modal="false" aria-label="Confirm deletion">
          {pending.kind === 'profile' ? (
            <>
              <p className="settings-confirm-text">
                {profileEraseSummary(pending.profile.name, pending.spaceCount, pending.tabCount)}
              </p>
              <ul className="settings-erase-list">
                {PROFILE_ERASE_ITEMS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="settings-hint">This cannot be undone.</p>
            </>
          ) : (
            <p className="settings-confirm-text">{spaceDeleteConfirmText(pending.space.name, pending.tabCount)}</p>
          )}
          <div className="settings-confirm-actions">
            <button type="button" className="settings-button" aria-label="Cancel deletion" onClick={() => setPending(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="settings-button settings-button-danger"
              aria-label={pending.kind === 'profile' ? 'Delete profile and erase its data' : 'Delete space'}
              onClick={confirmPending}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {message && (
        <p className="settings-error" role="alert">
          {message}
        </p>
      )}

      <form
        className="settings-add-form"
        onSubmit={(e) => {
          e.preventDefault();
          submitProfile();
        }}
      >
        <input
          className="settings-input"
          type="text"
          aria-label="New profile name"
          placeholder="New profile name"
          value={newProfileName}
          maxLength={PROFILE_NAME_MAX}
          onChange={(e) => setNewProfileName(e.target.value)}
        />
        <button
          type="submit"
          className="settings-button"
          aria-label="Create profile"
          disabled={busy || !cleanName(newProfileName, PROFILE_NAME_MAX)}
        >
          <Plus size={13} aria-hidden="true" />
          Profile
        </button>
      </form>

      <form
        className="settings-add-form"
        onSubmit={(e) => {
          e.preventDefault();
          submitSpace();
        }}
      >
        <input
          className="settings-input"
          type="text"
          aria-label="New space name"
          placeholder="New space name"
          value={newSpaceName}
          maxLength={SPACE_NAME_MAX}
          onChange={(e) => setNewSpaceName(e.target.value)}
        />
        <select
          className="settings-input settings-select"
          aria-label="Owning profile"
          value={owner ?? ''}
          onChange={(e) => setSpaceOwner(e.target.value)}
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="settings-button"
          aria-label="Create space"
          disabled={busy || !owner || !cleanName(newSpaceName, SPACE_NAME_MAX)}
        >
          <Plus size={13} aria-hidden="true" />
          Space
        </button>
      </form>
    </section>
  );
};
