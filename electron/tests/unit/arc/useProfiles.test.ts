import { describe, expect, it } from 'vitest';
import { groupSpacesByProfile } from '../../../src/renderer/hooks/useProfiles';

describe('groupSpacesByProfile (R13.1)', () => {
  const profiles = [
    { id: 'work', name: 'Work', createdAt: 20 },
    { id: 'default', name: 'Default', createdAt: 10 },
  ];
  const space = (id: string, profileId: string, order: number) => ({
    id,
    name: id,
    icon: 'Folder',
    color: '#fff',
    profileId,
    order,
  });

  it('orders profiles by creation and spaces by order within each profile', () => {
    const groups = groupSpacesByProfile(profiles, [
      space('w2', 'work', 1),
      space('d1', 'default', 0),
      space('w1', 'work', 0),
    ]);
    expect(groups.map((g) => g.profile.id)).toEqual(['default', 'work']);
    expect(groups.map((g) => g.spaces.map((s) => s.id))).toEqual([['d1'], ['w1', 'w2']]);
  });

  it('drops spaces of unknown profiles and keeps empty groups', () => {
    const groups = groupSpacesByProfile(profiles, [space('x', 'gone', 0)]);
    expect(groups.map((g) => g.spaces.length)).toEqual([0, 0]);
  });
});
