import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createFsMigrationIO,
  migrateToProfiles,
  MigrationIO,
  readLegacyState,
  runMigrationOnce,
} from '../../../src/main/profiles/migration';
import { CURRENT_SCHEMA_VERSION } from '../../../src/main/profiles/types';

const legacyState = {
  spaces: [
    { id: 'space-study', name: 'Study', icon: 'BookOpen', color: '#E4E4E7' },
    { id: 'space-custom', name: 'Side', icon: 'Star', color: '#123456' },
  ],
  bookmarks: [{ id: 'b1', title: 'Ex', url: 'https://example.com', createdAt: 1 }],
  settings: { theme: 'dark', pinnedSites: [{ url: 'https://mail.google.com' }] },
};

describe('migrateToProfiles', () => {
  it('creates one Default profile and assigns every space to it in order', () => {
    const out = migrateToProfiles(legacyState, 42);
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.migratedAt).toBe(42);
    expect(out.profiles).toEqual([{ id: 'default', name: 'Default', createdAt: 42 }]);
    expect(out.spaces).toEqual([
      { id: 'space-study', profileId: 'default', name: 'Study', icon: 'BookOpen', color: '#E4E4E7', order: 0 },
      { id: 'space-custom', profileId: 'default', name: 'Side', icon: 'Star', color: '#123456', order: 1 },
    ]);
    expect(out.tabs).toEqual([]);
    expect(out.favorites).toEqual([]);
    expect(out.archive).toEqual([]);
    expect(out.neverList).toEqual({});
  });

  it('does not modify the legacy input', () => {
    const copy = JSON.parse(JSON.stringify(legacyState));
    migrateToProfiles(copy, 1);
    expect(copy).toEqual(legacyState);
  });

  it('handles missing spaces', () => {
    expect(migrateToProfiles({}, 1).spaces).toEqual([]);
  });
});

describe('readLegacyState', () => {
  it('uses the default spaces when browser-state.json is missing', () => {
    const ids = (readLegacyState(null).spaces as { id: string }[]).map((s) => s.id);
    expect(ids).toEqual(['space-study', 'space-work', 'space-leisure']);
  });

  it('renames legacy DEFAULT/PLAN/MAX spaces like LocalStorageManager does', () => {
    const raw = JSON.stringify({ spaces: [{ id: 'space-default', name: 'DEFAULT', icon: 'x', color: 'y' }] });
    expect(readLegacyState(raw).spaces).toEqual([
      { id: 'space-study', name: 'Study', icon: 'BookOpen', color: '#E4E4E7' },
    ]);
  });
});

describe('runMigrationOnce (real fs)', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neutrino-migration-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('backs up browser-state.json, writes profiles.json and leaves legacy data untouched', () => {
    const statePath = path.join(dir, 'browser-state.json');
    const historyPath = path.join(dir, 'history.json');
    const original = JSON.stringify(legacyState, null, 2);
    fs.writeFileSync(statePath, original);
    fs.writeFileSync(historyPath, '[{"url":"https://a.com","title":"A","timestamp":1}]');

    const result = runMigrationOnce(createFsMigrationIO(dir));
    expect(result.status).toBe('migrated');
    if (result.status !== 'migrated') return;

    expect(fs.readFileSync(statePath, 'utf-8')).toBe(original);
    expect(result.backupPath).toMatch(/browser-state\.backup-\d+\.json$/);
    expect(fs.readFileSync(result.backupPath!, 'utf-8')).toBe(original);
    expect(fs.readFileSync(historyPath, 'utf-8')).toContain('https://a.com');

    const written = JSON.parse(fs.readFileSync(path.join(dir, 'profiles.json'), 'utf-8'));
    expect(written).toEqual(result.profiles);
    expect(written.spaces.map((s: { id: string }) => s.id)).toEqual(['space-study', 'space-custom']);
    expect(fs.readdirSync(dir).some((f) => f.endsWith('.tmp'))).toBe(false);
  });

  it('skips on the second run', () => {
    fs.writeFileSync(path.join(dir, 'browser-state.json'), JSON.stringify(legacyState));
    expect(runMigrationOnce(createFsMigrationIO(dir)).status).toBe('migrated');
    const before = fs.readdirSync(dir).sort();
    const profilesBefore = fs.readFileSync(path.join(dir, 'profiles.json'), 'utf-8');
    expect(runMigrationOnce(createFsMigrationIO(dir)).status).toBe('skipped');
    expect(fs.readdirSync(dir).sort()).toEqual(before);
    expect(fs.readFileSync(path.join(dir, 'profiles.json'), 'utf-8')).toBe(profilesBefore);
  });

  it('migrates a fresh install with no browser-state.json and writes no backup', () => {
    const result = runMigrationOnce(createFsMigrationIO(dir));
    expect(result.status).toBe('migrated');
    if (result.status !== 'migrated') return;
    expect(result.backupPath).toBeNull();
    expect(result.profiles.spaces).toHaveLength(3);
    expect(fs.existsSync(path.join(dir, 'browser-state.json'))).toBe(false);
  });
});

describe('runMigrationOnce (failure)', () => {
  function fakeIO(files: Map<string, string>, failOn: (p: string) => boolean): MigrationIO & { errors: unknown[] } {
    const errors: unknown[] = [];
    return {
      dataDir: '/data',
      errors,
      readFile: (p) => files.get(p) ?? null,
      writeFileAtomic: (p, d) => {
        if (failOn(p)) throw new Error(`disk full: ${p}`);
        files.set(p, d);
      },
      now: () => 7,
      logError: (_m, e) => errors.push(e),
    };
  }

  it('keeps browser-state.json unchanged and returns a runtime Default profile when profiles.json write fails', () => {
    const statePath = path.join('/data', 'browser-state.json');
    const original = JSON.stringify(legacyState);
    const files = new Map([[statePath, original]]);
    const io = fakeIO(files, (p) => p.endsWith('profiles.json'));

    const result = runMigrationOnce(io);
    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.partition).toBe('persist:neutrino');
    expect(result.profiles.profiles[0].id).toBe('default');
    expect(result.profiles.spaces.map((s) => s.id)).toEqual(['space-study', 'space-custom']);
    expect(files.get(statePath)).toBe(original);
    expect(files.get(path.join('/data', 'browser-state.backup-7.json'))).toBe(original);
    expect(files.has(path.join('/data', 'profiles.json'))).toBe(false);
    expect(io.errors).toHaveLength(1);
  });

  it('does not write profiles.json when the backup fails', () => {
    const statePath = path.join('/data', 'browser-state.json');
    const files = new Map([[statePath, JSON.stringify(legacyState)]]);
    const result = runMigrationOnce(fakeIO(files, (p) => p.includes('backup')));
    expect(result.status).toBe('failed');
    expect(files.has(path.join('/data', 'profiles.json'))).toBe(false);
  });

  it('falls back to default spaces when browser-state.json is malformed', () => {
    const statePath = path.join('/data', 'browser-state.json');
    const files = new Map([[statePath, '{not json']]);
    const result = runMigrationOnce(fakeIO(files, () => false));
    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.profiles.spaces).toHaveLength(3);
    expect(files.get(statePath)).toBe('{not json');
    expect(files.get(path.join('/data', 'browser-state.backup-7.json'))).toBe('{not json');
  });
});
