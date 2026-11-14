// Task 12.10: profile and space management helpers and the Settings section markup.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  LAST_PROFILE_MESSAGE,
  LAST_SPACE_MESSAGE,
  PROFILE_ERASE_ITEMS,
  cleanName,
  defaultSpaceOwner,
  describeManagementError,
  profileDeleteGuard,
  profileEraseSummary,
  spaceDeleteConfirmText,
  spaceDeleteDecision,
} from '../../../src/renderer/utils/profileManagement';
import { ProfilesSettings } from '../../../src/renderer/components/ProfilesSettings';
import type { Profile, Space, TabState } from '../../../src/renderer/types';

const profile = (id: string, createdAt = 0): Profile => ({ id, name: id, createdAt });
const space = (id: string, profileId: string): Space => ({ id, name: id, icon: '', color: '#fff', profileId });
const tab = (id: string, spaceId: string) => ({ id, spaceId }) as TabState;

describe('profile deletion (R1.7, R1.9)', () => {
  it('refuses to delete the last profile', () => {
    expect(profileDeleteGuard([profile('a')], 'a')).toEqual({ allowed: false, message: LAST_PROFILE_MESSAGE });
  });

  it('allows deleting one of several profiles, not an unknown one', () => {
    expect(profileDeleteGuard([profile('a'), profile('b')], 'b')).toEqual({ allowed: true });
    expect(profileDeleteGuard([profile('a'), profile('b')], 'zz').allowed).toBe(false);
  });

  it('lists tabs, spaces, session data, history and saved passwords as erased', () => {
    const text = PROFILE_ERASE_ITEMS.join(' ').toLowerCase();
    for (const word of ['tabs', 'spaces', 'cookies', 'logins', 'history', 'passwords', 'favorites']) {
      expect(text).toContain(word);
    }
  });

  it('summarizes counts, omitting tabs when unknown', () => {
    expect(profileEraseSummary('Work', 2, 1)).toBe('Delete "Work"? This closes 2 spaces and 1 tab and permanently erases:');
    expect(profileEraseSummary('Work', 1)).toBe('Delete "Work"? This closes 1 space and permanently erases:');
  });
});

describe('space deletion (R13.8, R13.9)', () => {
  const spaces = [space('s1', 'a'), space('s2', 'a'), space('s3', 'b')];

  it("blocks deleting a profile's only space", () => {
    expect(spaceDeleteDecision(spaces, 's3', [])).toEqual({ kind: 'blocked', message: LAST_SPACE_MESSAGE });
  });

  it('confirms when the space has tabs and deletes directly when empty', () => {
    expect(spaceDeleteDecision(spaces, 's1', [tab('t1', 's1'), tab('t2', 's2')])).toEqual({ kind: 'confirm', tabCount: 1 });
    expect(spaceDeleteDecision(spaces, 's1', [tab('t2', 's2')])).toEqual({ kind: 'delete' });
  });

  it('always confirms when tabs are unknown', () => {
    expect(spaceDeleteDecision(spaces, 's1')).toEqual({ kind: 'confirm', tabCount: null });
    expect(spaceDeleteConfirmText('Home', null)).toBe('Delete space "Home"? This closes its tabs.');
    expect(spaceDeleteConfirmText('Home', 3)).toBe('Delete space "Home"? This closes 3 tabs.');
  });
});

describe('new space owner (R1.11)', () => {
  const profiles = [profile('a'), profile('b')];

  it('defaults to the active profile and honours a valid selection', () => {
    expect(defaultSpaceOwner(profiles, 'b')).toBe('b');
    expect(defaultSpaceOwner(profiles, 'b', 'a')).toBe('a');
    expect(defaultSpaceOwner(profiles, 'b', 'gone')).toBe('b');
    expect(defaultSpaceOwner(profiles, null)).toBe('a');
    expect(defaultSpaceOwner([], null)).toBeNull();
  });
});

describe('names and errors', () => {
  it('trims and rejects empty names', () => {
    expect(cleanName('  Work  ', 40)).toBe('Work');
    expect(cleanName('   ', 40)).toBeNull();
    expect(cleanName('abcdef', 3)).toBe('abc');
  });

  it('maps IPC error codes to messages', () => {
    expect(describeManagementError('last-profile')).toBe(LAST_PROFILE_MESSAGE);
    expect(describeManagementError('last-space')).toBe(LAST_SPACE_MESSAGE);
    expect(describeManagementError('whatever')).toMatch(/went wrong/);
  });
});

describe('ProfilesSettings markup', () => {
  it('renders its own heading class and labelled create controls', () => {
    const html = renderToStaticMarkup(createElement(ProfilesSettings, {}));
    expect(html).toContain('<h3 class="settings-group-title">Profiles &amp; spaces</h3>');
    expect(html).not.toContain('settings-section-title');
    for (const label of ['New profile name', 'Create profile', 'New space name', 'Owning profile', 'Create space']) {
      expect(html).toContain(`aria-label="${label}"`);
    }
  });
});
