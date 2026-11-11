import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import {
  partitionForProfile,
  DEFAULT_PROFILE_ID,
  DEFAULT_PARTITION,
} from '../../../src/main/profiles/partition';
import { CURRENT_SCHEMA_VERSION } from '../../../src/main/profiles/types';

describe('partitionForProfile', () => {
  it('maps the Default profile to the legacy persist:neutrino partition', () => {
    expect(DEFAULT_PROFILE_ID).toBe('default');
    expect(DEFAULT_PARTITION).toBe('persist:neutrino');
    expect(partitionForProfile('default')).toBe('persist:neutrino');
  });

  it('maps other profiles to persist:profile-<id>', () => {
    expect(partitionForProfile('work')).toBe('persist:profile-work');
    expect(partitionForProfile('a1b2')).toBe('persist:profile-a1b2');
  });

  it('gives distinct profiles distinct partitions', () => {
    expect(partitionForProfile('work')).not.toBe(partitionForProfile('personal'));
    expect(partitionForProfile('neutrino')).not.toBe(DEFAULT_PARTITION);
  });
});

describe('profiles module purity', () => {
  it('exports a positive integer schema version', () => {
    expect(Number.isInteger(CURRENT_SCHEMA_VERSION)).toBe(true);
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThan(0);
  });

  it('does not import electron', () => {
    for (const file of ['types.ts', 'partition.ts']) {
      const src = fs.readFileSync(
        path.join(__dirname, '../../../src/main/profiles', file),
        'utf8',
      );
      expect(src).not.toMatch(/from\s+['"]electron['"]|require\(\s*['"]electron['"]\s*\)/);
    }
  });
});
