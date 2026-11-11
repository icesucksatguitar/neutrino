import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import {
  shouldCapture,
  PreviewStore,
  PreviewService,
  PERIODIC_CAPTURE_INTERVAL_MS,
} from '../../../src/main/previews/service';

describe('shouldCapture', () => {
  it('always accepts deactivation captures', () => {
    expect(shouldCapture(1000, 1001, 'deactivation')).toBe(true);
    expect(shouldCapture(null, 0, 'deactivation')).toBe(true);
  });

  it('accepts a periodic capture when the tab was never captured', () => {
    expect(shouldCapture(null, 5, 'periodic')).toBe(true);
    expect(shouldCapture(undefined, 5, 'periodic')).toBe(true);
  });

  it('accepts periodic captures at most once per 30s', () => {
    expect(PERIODIC_CAPTURE_INTERVAL_MS).toBe(30_000);
    expect(shouldCapture(0, 29_999, 'periodic')).toBe(false);
    expect(shouldCapture(0, 30_000, 'periodic')).toBe(true);
  });
});

describe('PreviewStore', () => {
  const p = { image: 'data:x', capturedAt: 1 };

  it('keeps a preview when the tab sleeps and deletes it on close/archive', () => {
    const s = new PreviewStore();
    s.set('a', p);
    s.set('b', p);
    s.onSleep('a');
    expect(s.get('a')).toEqual(p);
    s.onClose('a');
    s.onArchive('b');
    expect(s.get('a')).toBeUndefined();
    expect(s.get('b')).toBeUndefined();
    expect(s.size).toBe(0);
  });
});

describe('PreviewService', () => {
  function make() {
    let now = 0;
    const calls: string[] = [];
    const svc = new PreviewService(async (id) => {
      calls.push(id);
      return `img-${id}-${now}`;
    }, () => now);
    return { svc, calls, tick: (ms: number) => { now += ms; } };
  }

  it('throttles periodic captures and stores by tab id', async () => {
    const { svc, calls, tick } = make();
    expect(await svc.requestCapture('t1', 'periodic')).toBe(true);
    tick(10_000);
    expect(await svc.requestCapture('t1', 'periodic')).toBe(false);
    expect(await svc.requestCapture('t1', 'deactivation')).toBe(true);
    expect(svc.get('t1')?.image).toBe('img-t1-10000');
    tick(29_999);
    expect(await svc.requestCapture('t1', 'periodic')).toBe(false);
    tick(1);
    expect(await svc.requestCapture('t1', 'periodic')).toBe(true);
    expect(calls).toEqual(['t1', 't1', 't1']);
  });

  it('does not capture sleeping tabs but keeps their last preview', async () => {
    const { svc, calls } = make();
    await svc.requestCapture('t1', 'deactivation');
    svc.onSleep('t1');
    expect(await svc.requestCapture('t1', 'deactivation')).toBe(false);
    expect(svc.get('t1')?.image).toBe('img-t1-0');
    svc.onWake('t1');
    expect(await svc.requestCapture('t1', 'deactivation')).toBe(true);
    expect(calls.length).toBe(2);
  });

  it('drops a capture that finishes after the tab was closed', async () => {
    let release!: (v: string) => void;
    const svc = new PreviewService(() => new Promise((r) => { release = r; }));
    const pending = svc.requestCapture('t1', 'deactivation');
    svc.onClose('t1');
    release('img');
    expect(await pending).toBe(false);
    expect(svc.get('t1')).toBeUndefined();
  });

  it('ignores failed or empty captures', async () => {
    const svc = new PreviewService(async () => null);
    expect(await svc.requestCapture('t1', 'deactivation')).toBe(false);
    const bad = new PreviewService(async () => { throw new Error('gone'); });
    expect(await bad.requestCapture('t1', 'deactivation')).toBe(false);
  });

  it('does not import electron', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../src/main/previews/service.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/from\s+['"]electron['"]|require\(['"]electron['"]\)/);
  });
});
