import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, afterEach } from 'vitest';
import { HistoryManager, isRecordableHistoryUrl, deriveFallbackTitle } from '../../src/main/history';

const tempDirs: string[] = [];

function createTempFile(name = 'history.json'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neutrino-hist-test-'));
  tempDirs.push(dir);
  return path.join(dir, name);
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('HistoryManager and URL filters', () => {
  it('filters recordable schemes accurately', () => {
    expect(isRecordableHistoryUrl('https://example.com/docs')).toBe(true);
    expect(isRecordableHistoryUrl('http://localhost:5173/')).toBe(true);
    expect(isRecordableHistoryUrl('file:///C:/notes/index.html')).toBe(true);

    expect(isRecordableHistoryUrl('')).toBe(false);
    expect(isRecordableHistoryUrl('neutrino://newtab')).toBe(false);
    expect(isRecordableHistoryUrl('neutrino://history')).toBe(false);
    expect(isRecordableHistoryUrl('about:blank')).toBe(false);
    expect(isRecordableHistoryUrl('javascript:void(0)')).toBe(false);
    expect(isRecordableHistoryUrl('data:text/html,hi')).toBe(false);
    expect(isRecordableHistoryUrl('chrome-extension://abc/index.html')).toBe(false);
  });

  it('derives readable fallback titles', () => {
    expect(deriveFallbackTitle('https://developer.mozilla.org/en-US/docs')).toBe('developer.mozilla.org');
    expect(deriveFallbackTitle('file:///C:/docs/paper.pdf')).toBe('paper.pdf');
  });

  it('records visits, deduplicates consecutive visits cleanly, updates metadata, searches, deletes, and persists', () => {
    const file = createTempFile();
    const hm = new HistoryManager(file, { maxEntries: 5, debounceMs: 0 });
    const t0 = 1_700_000_000_000;

    const first = hm.recordVisit({ url: 'https://example.com/', timestamp: t0, spaceId: 'space-study' });
    expect(first?.title).toBe('example.com');
    expect(first?.visitCount).toBe(1);

    // Same URL within 5 minutes increments visitCount instead of duplicating top entry
    const dup = hm.recordVisit({
      url: 'https://example.com/',
      title: 'Example Domain',
      timestamp: t0 + 10_000,
    });
    expect(dup?.visitCount).toBe(2);
    expect(dup?.title).toBe('Example Domain');
    expect(hm.getEntries()).toHaveLength(1);

    // Metadata update after page title & favicon arrive
    hm.updateMetadata('https://example.com/', { favicon: 'https://example.com/favicon.ico' }, t0 + 12_000);
    expect(hm.getEntries()[0].favicon).toBe('https://example.com/favicon.ico');

    // Additional distinct URLs
    hm.recordVisit({ url: 'https://github.com/trending', title: 'GitHub Trending', timestamp: t0 + 20_000, spaceId: 'space-work' });
    hm.recordVisit({ url: 'https://en.wikipedia.org/wiki/Electron', title: 'Electron Wiki', timestamp: t0 + 30_000, spaceId: 'space-study' });

    expect(hm.getEntries().map((e) => e.url)).toEqual([
      'https://en.wikipedia.org/wiki/Electron',
      'https://github.com/trending',
      'https://example.com/',
    ]);

    // Search multi-term & space filter
    expect(hm.getEntries({ query: 'github trending' })).toHaveLength(1);
    expect(hm.getEntries({ spaceId: 'space-work' })).toHaveLength(1);
    expect(hm.getEntries({ query: 'wiki', spaceId: 'space-work' })).toHaveLength(0);

    // Reload from disk verifies persistence
    hm.flush();
    const reloaded = new HistoryManager(file, { maxEntries: 5, debounceMs: 0 });
    expect(reloaded.getEntries()).toHaveLength(3);
    expect(reloaded.getEntries()[0].title).toBe('Electron Wiki');

    // Delete individual entry
    const targetId = reloaded.getEntries()[1].id;
    expect(reloaded.deleteEntry({ id: targetId })).toBe(true);
    expect(reloaded.getEntries()).toHaveLength(2);

    // Clear by time window ('hour') & 'all'
    reloaded.recordVisit({ url: 'https://old.example.org/', title: 'Old', timestamp: t0 - 10 * 60 * 60 * 1000 });
    // Force sort consistency on reload/add
    const hmRange = new HistoryManager(createTempFile('range.json'), { debounceMs: 0 });
    const now = 2_000_000_000_000;
    hmRange.recordVisit({ url: 'https://ancient.com', title: 'Ancient', timestamp: now - 48 * 3600_000 });
    hmRange.recordVisit({ url: 'https://yesterday.com', title: 'Day', timestamp: now - 5 * 3600_000 });
    hmRange.recordVisit({ url: 'https://recent.com', title: 'Recent', timestamp: now - 10 * 60_000 });

    const removedHour = hmRange.clear('hour', now);
    expect(removedHour).toBe(1);
    expect(hmRange.getEntries().map((e) => e.url)).toEqual(['https://yesterday.com', 'https://ancient.com']);

    const removedDay = hmRange.clear('day', now);
    expect(removedDay).toBe(1);
    expect(hmRange.getEntries().map((e) => e.url)).toEqual(['https://ancient.com']);

    const removedAll = hmRange.clear('all', now);
    expect(removedAll).toBe(1);
    expect(hmRange.getEntries()).toEqual([]);
  });

  it('recovers safely from corrupted history files and enforces maxEntries cap', () => {
    const file = createTempFile('corrupt.json');
    fs.writeFileSync(file, '{ not valid json', 'utf-8');
    const hm = new HistoryManager(file, { maxEntries: 10, debounceMs: 0 });
    expect(hm.getEntries()).toEqual([]);

    for (let i = 0; i < 15; i++) {
      hm.recordVisit({ url: `https://site-${i}.example.com`, timestamp: 1000 + i * 1000 });
    }
    expect(hm.getEntries({ limit: 50 })).toHaveLength(10);
    expect(hm.getEntries({ limit: 50 })[0].url).toBe('https://site-14.example.com');
  });
});

