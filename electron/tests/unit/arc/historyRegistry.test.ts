import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import fc from 'fast-check';
import { HistoryRegistry, historyFileName } from '../../../src/main/history/registry';
import { HistoryManager } from '../../../src/main/history';
import { DEFAULT_PROFILE_ID } from '../../../src/main/profiles/partition';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neutrino-histreg-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const make = () => new HistoryRegistry({ dir, managerOptions: { debounceMs: 0 } });

describe('HistoryRegistry', () => {
  it('maps Default to history.json and others to history-<id>.json; rejects unsafe ids', () => {
    expect(historyFileName(DEFAULT_PROFILE_ID)).toBe('history.json');
    expect(historyFileName('work')).toBe('history-work.json');
    expect(() => historyFileName('../x')).toThrow();
    expect(() => historyFileName('')).toThrow();
  });

  it('Default loads the existing history.json (migration keeps history)', () => {
    const legacy = new HistoryManager(path.join(dir, 'history.json'), { debounceMs: 0 });
    legacy.recordVisit({ url: 'https://old.example.com/', title: 'Old', timestamp: 1000 });
    legacy.destroy();

    const reg = make();
    expect(reg.has(DEFAULT_PROFILE_ID)).toBe(false);
    expect(reg.for(DEFAULT_PROFILE_ID).getEntries().map((e) => e.url)).toEqual(['https://old.example.com/']);
    expect(reg.for('other').getEntries()).toEqual([]);
  });

  it('builds one manager per profile lazily and returns the same instance', () => {
    const reg = make();
    const a = reg.for('a');
    expect(reg.for('a')).toBe(a);
    expect(reg.for('b')).not.toBe(a);
  });

  it('keeps profiles isolated on record and clear (R4.1, R4.4)', () => {
    const reg = make();
    reg.for('a').recordVisit({ url: 'https://a.example.com/', timestamp: 1000 });
    reg.for('b').recordVisit({ url: 'https://b.example.com/', timestamp: 1000 });
    reg.for('a').clear('all');
    expect(reg.for('a').getEntries()).toEqual([]);
    expect(reg.for('b').getEntries().map((e) => e.url)).toEqual(['https://b.example.com/']);
    expect(fs.existsSync(path.join(dir, 'history-b.json'))).toBe(true);
  });

  it('remove deletes only that profile file and leaves Default history.json', () => {
    const reg = make();
    reg.for(DEFAULT_PROFILE_ID).recordVisit({ url: 'https://d.example.com/', timestamp: 1000 });
    reg.for('gone').recordVisit({ url: 'https://g.example.com/', timestamp: 1000 });
    reg.remove('gone');
    expect(fs.existsSync(path.join(dir, 'history-gone.json'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'history.json'))).toBe(true);
    expect(reg.has('gone')).toBe(false);
    expect(reg.for('gone').getEntries()).toEqual([]);
    expect(reg.for(DEFAULT_PROFILE_ID).getEntries()).toHaveLength(1);
  });

  it('remove of an unbuilt profile deletes its file on disk', () => {
    fs.writeFileSync(path.join(dir, 'history-cold.json'), '{"version":1,"entries":[]}');
    make().remove('cold');
    expect(fs.existsSync(path.join(dir, 'history-cold.json'))).toBe(false);
  });

  it('remove does not leave a pending debounced save that recreates the file', async () => {
    const reg = new HistoryRegistry({ dir, managerOptions: { debounceMs: 20 } });
    const m = reg.for('p');
    m.recordVisit({ url: 'https://p.example.com/', timestamp: 1000 });
    m.updateMetadata('https://p.example.com/', { title: 'Later' }, 1000); // schedules debounced save
    reg.remove('p');
    await new Promise((r) => setTimeout(r, 60));
    expect(fs.existsSync(path.join(dir, 'history-p.json'))).toBe(false);
  });

  it('onChange reports the owning profile id', () => {
    const reg = make();
    const seen: string[] = [];
    reg.onChange((id) => seen.push(id));
    reg.for('x').recordVisit({ url: 'https://x.example.com/', timestamp: 1000 });
    reg.for('y').recordVisit({ url: 'https://y.example.com/', timestamp: 1000 });
    expect(seen).toEqual(['x', 'y']);
  });

  it('property: visits recorded for one profile never appear in another (R4.1-R4.3)', () => {
    // **Validates: Requirements 4.1, 4.2, 4.3**
    const profileId = fc.constantFrom(DEFAULT_PROFILE_ID, 'p1', 'p2', 'p3');
    const visit = fc.record({
      profile: profileId,
      host: fc.stringMatching(/^[a-z]{1,8}$/),
      ts: fc.integer({ min: 1, max: 1e9 }),
    });
    fc.assert(
      fc.property(fc.array(visit, { maxLength: 30 }), (visits) => {
        const sub = fs.mkdtempSync(path.join(dir, 'run-'));
        const reg = new HistoryRegistry({ dir: sub, managerOptions: { debounceMs: 0 } });
        for (const v of visits) {
          reg.for(v.profile).recordVisit({ url: `https://${v.profile}-${v.host}.example.com/`, timestamp: v.ts });
        }
        // Reload from disk to check persistence is isolated too.
        const fresh = new HistoryRegistry({ dir: sub, managerOptions: { debounceMs: 0 } });
        for (const id of [DEFAULT_PROFILE_ID, 'p1', 'p2', 'p3']) {
          const urls = fresh.for(id).getEntries({ limit: 1000 }).map((e) => e.url);
          expect(urls.every((u) => u.startsWith(`https://${id}-`))).toBe(true);
          const expected = new Set(visits.filter((v) => v.profile === id).map((v) => `https://${id}-${v.host}.example.com/`));
          expect(new Set(urls)).toEqual(expected);
        }
      }),
      { numRuns: 50 },
    );
  });
});
