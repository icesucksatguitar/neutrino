import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PREVIEW_HIDE_DELAY_MS,
  PREVIEW_SHOW_DELAY_MS,
  createHoverPreview,
  loadPreview,
  previewCardPosition,
  previewTargetFor,
  type HoverPreviewState,
  type PreviewTarget,
} from '../../../src/renderer/utils/hoverPreview';
import type { SidebarItemRef } from '../../../src/renderer/utils/sidebarModel';
import type { TabState } from '../../../src/renderer/types';

const anchor = { top: 100, bottom: 128, left: 0, right: 240 };

function tab(id: string, extra: Partial<TabState> = {}): TabState {
  return { id, url: `https://${id}.test/`, title: `Tab ${id}`, isSleeping: false, ...extra } as TabState;
}

function target(key: string, extra: Partial<PreviewTarget> = {}): PreviewTarget {
  return { key, tabId: key, title: `Tab ${key}`, url: `https://${key}.test/`, source: 'capture', anchor, ...extra };
}

/** Promise that the test resolves by hand, to model a slow IPC response. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('previewTargetFor', () => {
  it('captures awake tabs and uses stored snapshots for sleeping or unloaded tabs (R18.5)', () => {
    const awake: SidebarItemRef = { kind: 'today', id: 'a', index: 0, url: 'https://a.test/', title: 'A', tab: tab('a') };
    const asleep: SidebarItemRef = { ...awake, id: 'b', tab: tab('b', { isSleeping: true }) };
    const unloaded: SidebarItemRef = { ...awake, kind: 'pinned', id: 'c', tab: tab('c', { unloaded: true }) };
    const noTab: SidebarItemRef = { kind: 'pinned', id: 'd', index: 0, url: 'https://d.test/', title: 'D' };
    expect(previewTargetFor(awake, anchor)).toMatchObject({ tabId: 'a', source: 'capture', title: 'A' });
    expect(previewTargetFor(asleep, anchor)).toMatchObject({ tabId: 'b', source: 'stored' });
    expect(previewTargetFor(unloaded, anchor)).toMatchObject({ tabId: 'c', source: 'stored' });
    expect(previewTargetFor(noTab, anchor)).toMatchObject({ tabId: 'd', source: 'stored' });
  });

  it('uses the open tab of a favorite, and a placeholder only for a favorite that is not open', () => {
    const favorite = { id: 'f1', url: 'https://f.test/', title: 'F' } as SidebarItemRef['favorite'];
    const closed: SidebarItemRef = { kind: 'favorite', id: 'f1', index: 0, url: 'https://f.test/', title: 'F', favorite };
    const open: SidebarItemRef = { ...closed, tab: tab('t9') };
    expect(previewTargetFor(closed, anchor)).toMatchObject({ key: 'f1', tabId: null, source: 'none' });
    expect(previewTargetFor(open, anchor)).toMatchObject({ key: 'f1', tabId: 't9', source: 'capture' });
  });
});

describe('loadPreview', () => {
  it('calls capture for awake tabs and the stored getter for sleeping tabs', async () => {
    const api = {
      captureTabPreviewById: vi.fn(async (id: string) => `data:capture-${id}`),
      getTabPreview: vi.fn(async (id: string) => `data:stored-${id}`),
    };
    expect(await loadPreview(target('a'), api)).toBe('data:capture-a');
    expect(await loadPreview(target('b', { source: 'stored' }), api)).toBe('data:stored-b');
    expect(api.captureTabPreviewById).toHaveBeenCalledTimes(1);
    expect(api.getTabPreview).toHaveBeenCalledTimes(1);
  });

  it('returns null for placeholders, missing APIs and empty responses', async () => {
    const api = { captureTabPreviewById: vi.fn(async () => ''), getTabPreview: vi.fn(async () => null) };
    expect(await loadPreview(target('f', { source: 'none', tabId: null }), api)).toBeNull();
    expect(await loadPreview(target('a'), api)).toBeNull();
    expect(await loadPreview(target('b', { source: 'stored' }), api)).toBeNull();
    expect(await loadPreview(target('a'), undefined)).toBeNull();
    expect(api.captureTabPreviewById).toHaveBeenCalledTimes(1);
  });
});

describe('previewCardPosition', () => {
  it('places the card right of the tab and clamps it to the viewport', () => {
    const size = { width: 260, height: 214 };
    expect(previewCardPosition(anchor, { width: 1200, height: 800 }, size)).toEqual({ left: 248, top: 96 });
    // Near the bottom edge the card moves up.
    expect(previewCardPosition({ ...anchor, top: 780, bottom: 808 }, { width: 1200, height: 800 }, size).top).toBe(578);
    // No room on the right: flip to the left side.
    expect(previewCardPosition({ top: 100, bottom: 128, left: 900, right: 1100 }, { width: 1200, height: 800 }, size).left).toBe(632);
  });
});

describe('createHoverPreview', () => {
  let states: (HoverPreviewState | null)[];
  let load: ReturnType<typeof vi.fn>;

  const make = () =>
    createHoverPreview({
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      load: load as unknown as (t: PreviewTarget) => Promise<string | null>,
      onChange: (s) => states.push(s),
    });

  beforeEach(() => {
    vi.useFakeTimers();
    states = [];
    load = vi.fn(async (t: PreviewTarget) => `data:${t.key}`);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows after 400 ms of hover, then fills in the image (R18.1)', async () => {
    const c = make();
    c.enterItem(target('a'));
    vi.advanceTimersByTime(PREVIEW_SHOW_DELAY_MS - 1);
    expect(c.getState()).toBeNull();
    expect(load).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(c.getState()).toMatchObject({ status: 'loading', image: null, target: { key: 'a' } });
    await vi.runAllTimersAsync();
    expect(c.getState()).toMatchObject({ status: 'ready', image: 'data:a' });
  });

  it('does not show when the pointer leaves before the delay', () => {
    const c = make();
    c.enterItem(target('a'));
    vi.advanceTimersByTime(300);
    c.leaveItem();
    vi.advanceTimersByTime(1000);
    expect(c.getState()).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('stays open while the pointer moves onto the card and hides after leaving both (R18.2)', async () => {
    const c = make();
    c.enterItem(target('a'));
    await vi.advanceTimersByTimeAsync(PREVIEW_SHOW_DELAY_MS);
    c.leaveItem();
    vi.advanceTimersByTime(PREVIEW_HIDE_DELAY_MS - 10);
    c.enterCard();
    vi.advanceTimersByTime(5000);
    expect(c.getState()).not.toBeNull();
    c.leaveCard();
    vi.advanceTimersByTime(PREVIEW_HIDE_DELAY_MS);
    expect(c.getState()).toBeNull();
    expect(states[states.length - 1]).toBeNull();
  });

  it('hides after leaving the tab when the pointer does not reach the card', async () => {
    const c = make();
    c.enterItem(target('a'));
    await vi.advanceTimersByTimeAsync(PREVIEW_SHOW_DELAY_MS);
    c.leaveItem();
    vi.advanceTimersByTime(PREVIEW_HIDE_DELAY_MS);
    expect(c.getState()).toBeNull();
  });

  it('switches to another tab at once while a card is open', async () => {
    const c = make();
    c.enterItem(target('a'));
    await vi.advanceTimersByTimeAsync(PREVIEW_SHOW_DELAY_MS);
    c.leaveItem();
    c.enterItem(target('b'));
    expect(c.getState()?.target.key).toBe('b');
    vi.advanceTimersByTime(PREVIEW_HIDE_DELAY_MS * 2);
    expect(c.getState()?.target.key).toBe('b');
  });

  it('ignores a stale response after the hovered tab changed', async () => {
    const slowA = deferred<string | null>();
    load.mockImplementation((t: PreviewTarget) => (t.key === 'a' ? slowA.promise : Promise.resolve(`data:${t.key}`)));
    const c = make();
    c.enterItem(target('a'));
    vi.advanceTimersByTime(PREVIEW_SHOW_DELAY_MS);
    c.enterItem(target('b'));
    await vi.runAllTimersAsync();
    expect(c.getState()).toMatchObject({ target: { key: 'b' }, image: 'data:b' });
    slowA.resolve('data:a');
    await vi.runAllTimersAsync();
    expect(c.getState()).toMatchObject({ target: { key: 'b' }, image: 'data:b' });
  });

  it('ignores a response that arrives after the card was hidden', async () => {
    const slow = deferred<string | null>();
    load.mockImplementation(() => slow.promise);
    const c = make();
    c.enterItem(target('a'));
    vi.advanceTimersByTime(PREVIEW_SHOW_DELAY_MS);
    c.hide();
    slow.resolve('data:a');
    await vi.runAllTimersAsync();
    expect(c.getState()).toBeNull();
  });

  it('shows the placeholder when no preview exists or loading fails (R18.6)', async () => {
    load.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('gone'));
    const c = make();
    c.enterItem(target('a'));
    await vi.advanceTimersByTimeAsync(PREVIEW_SHOW_DELAY_MS);
    expect(c.getState()).toMatchObject({ status: 'ready', image: null });
    c.enterItem(target('b'));
    await vi.runAllTimersAsync();
    expect(c.getState()).toMatchObject({ target: { key: 'b' }, status: 'ready', image: null });
  });

  it('does not load anything for a favorite that is not open', async () => {
    const c = make();
    c.enterItem(target('f', { source: 'none', tabId: null }));
    await vi.advanceTimersByTimeAsync(PREVIEW_SHOW_DELAY_MS);
    expect(c.getState()).toMatchObject({ status: 'ready', image: null });
    expect(load).not.toHaveBeenCalled();
  });

  it('hides and shows nothing while suppressed (dragging)', async () => {
    const c = make();
    c.enterItem(target('a'));
    await vi.advanceTimersByTimeAsync(PREVIEW_SHOW_DELAY_MS);
    c.setSuppressed(true);
    expect(c.getState()).toBeNull();
    c.enterItem(target('b'));
    vi.advanceTimersByTime(PREVIEW_SHOW_DELAY_MS * 2);
    expect(c.getState()).toBeNull();
    c.setSuppressed(false);
    c.enterItem(target('b'));
    vi.advanceTimersByTime(PREVIEW_SHOW_DELAY_MS);
    expect(c.getState()?.target.key).toBe('b');
  });

  it('a pending show is cancelled by suppression that starts during the delay', () => {
    const c = make();
    c.enterItem(target('a'));
    vi.advanceTimersByTime(200);
    c.setSuppressed(true);
    c.setSuppressed(false);
    vi.advanceTimersByTime(PREVIEW_SHOW_DELAY_MS);
    expect(c.getState()).toBeNull();
  });
});
