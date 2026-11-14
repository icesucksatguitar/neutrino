// Hover page previews for the sidebar (R18.1, R18.2, R18.5, R18.6).
//
// Pure timing/state logic: timers and the preview loader are injected so the
// controller runs under fake timers in unit tests. The React side lives in
// `hooks/useHoverPreview.ts` and `components/TabPreviewCard.tsx`.

import type { SidebarItemRef } from './sidebarModel';

/** Hover delay before a preview appears (decision A4). */
export const PREVIEW_SHOW_DELAY_MS = 400;
/** Grace period so the pointer can travel from the tab to the card without the card closing. */
export const PREVIEW_HIDE_DELAY_MS = 150;

export const PREVIEW_CARD_WIDTH = 260;
export const PREVIEW_CARD_HEIGHT = 214;
const CARD_GAP = 8;
const VIEWPORT_MARGIN = 8;

/**
 * Where the image comes from:
 * - `capture`: awake tab, ask main for a fresh (throttled) capture;
 * - `stored`: sleeping/unloaded tab, use the last saved snapshot only (R18.5);
 * - `none`: a favorite that is not open as a tab, placeholder only.
 */
export type PreviewSource = 'capture' | 'stored' | 'none';

export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface PreviewTarget {
  /** Sidebar item id (tab id or favorite id); identifies the hover. */
  key: string;
  /** Tab whose preview is shown; null for a favorite that is not open. */
  tabId: string | null;
  title: string;
  url: string;
  favicon?: string;
  source: PreviewSource;
  anchor: AnchorRect;
  isSleeping?: boolean;
}

export interface HoverPreviewState {
  target: PreviewTarget;
  /** `loading` while the image request is in flight; the card shows the placeholder meanwhile. */
  status: 'loading' | 'ready';
  /** Data URL, or null when no preview exists (placeholder, R18.6). */
  image: string | null;
}

export interface PreviewApi {
  captureTabPreviewById?: (tabId: string) => Promise<string | null>;
  getTabPreview?: (tabId: string) => Promise<string | null>;
}

/** Builds the hover target for a sidebar item. */
export function previewTargetFor(item: SidebarItemRef, anchor: AnchorRect): PreviewTarget {
  const tab = item.tab;
  let tabId: string | null;
  let source: PreviewSource;
  if (item.kind === 'favorite') {
    tabId = tab ? tab.id : null;
    source = !tab ? 'none' : tab.isSleeping || tab.unloaded ? 'stored' : 'capture';
  } else {
    tabId = item.id;
    // A pinned row without a live tab is an unloaded pin.
    source = !tab || tab.isSleeping || tab.unloaded ? 'stored' : 'capture';
  }
  const favicon = item.favicon ?? tab?.favicon;
  return {
    key: item.id,
    tabId,
    title: item.title || tab?.title || item.url || 'New Tab',
    url: item.url || tab?.url || '',
    ...(favicon ? { favicon } : {}),
    source,
    anchor,
    ...(tab?.isSleeping ? { isSleeping: true } : {}),
  };
}

/** Asks main for the image: capture for awake tabs, stored snapshot only for sleeping/unloaded tabs. */
export async function loadPreview(target: PreviewTarget, api: PreviewApi | undefined): Promise<string | null> {
  if (!api || target.tabId === null || target.source === 'none') return null;
  const fn = target.source === 'capture' ? api.captureTabPreviewById : api.getTabPreview;
  if (typeof fn !== 'function') return null;
  const img = await fn(target.tabId);
  return typeof img === 'string' && img.length > 0 ? img : null;
}

/** Card position next to the anchor, flipped to the left and clamped to the viewport. */
export function previewCardPosition(
  anchor: AnchorRect,
  viewport: { width: number; height: number },
  size: { width: number; height: number } = { width: PREVIEW_CARD_WIDTH, height: PREVIEW_CARD_HEIGHT },
): { left: number; top: number } {
  let left = anchor.right + CARD_GAP;
  if (left + size.width > viewport.width - VIEWPORT_MARGIN) {
    left = Math.max(VIEWPORT_MARGIN, anchor.left - CARD_GAP - size.width);
  }
  const maxTop = Math.max(VIEWPORT_MARGIN, viewport.height - size.height - VIEWPORT_MARGIN);
  const top = Math.min(Math.max(VIEWPORT_MARGIN, anchor.top - 4), maxTop);
  return { left, top };
}

export interface HoverPreviewDeps {
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  load: (target: PreviewTarget) => Promise<string | null> | string | null;
  onChange: (state: HoverPreviewState | null) => void;
  showDelayMs?: number;
  hideDelayMs?: number;
}

export interface HoverPreviewController {
  enterItem(target: PreviewTarget): void;
  leaveItem(): void;
  enterCard(): void;
  leaveCard(): void;
  /** Hides at once and drops in-flight responses (pointer down, blur, item removed). */
  hide(): void;
  /** While suppressed (dragging, sidebar hidden, menu open) nothing shows. */
  setSuppressed(suppressed: boolean): void;
  getState(): HoverPreviewState | null;
  dispose(): void;
}

export function createHoverPreview(deps: HoverPreviewDeps): HoverPreviewController {
  const showDelay = deps.showDelayMs ?? PREVIEW_SHOW_DELAY_MS;
  const hideDelay = deps.hideDelayMs ?? PREVIEW_HIDE_DELAY_MS;

  let state: HoverPreviewState | null = null;
  let overItem: string | null = null;
  let overCard = false;
  let suppressed = false;
  let showTimer: unknown = null;
  let hideTimer: unknown = null;
  /** Bumped on every show/hide; a response with an older token is stale. */
  let token = 0;

  const emit = () => deps.onChange(state);

  const clearShow = () => {
    if (showTimer !== null) deps.clearTimer(showTimer);
    showTimer = null;
  };
  const clearHide = () => {
    if (hideTimer !== null) deps.clearTimer(hideTimer);
    hideTimer = null;
  };

  const show = (target: PreviewTarget) => {
    const mine = ++token;
    state = { target, status: target.source === 'none' ? 'ready' : 'loading', image: null };
    emit();
    if (target.source === 'none') return;
    const settle = (img: unknown) => {
      if (mine !== token || !state || state.target.key !== target.key) return;
      state = { ...state, status: 'ready', image: typeof img === 'string' && img.length > 0 ? img : null };
      emit();
    };
    let result: Promise<string | null> | string | null;
    try {
      result = deps.load(target);
    } catch {
      settle(null);
      return;
    }
    Promise.resolve(result).then(settle, () => settle(null));
  };

  const hide = () => {
    clearShow();
    clearHide();
    token++;
    overCard = false;
    if (state) {
      state = null;
      emit();
    }
  };

  const scheduleHide = () => {
    clearHide();
    hideTimer = deps.setTimer(() => {
      hideTimer = null;
      if (overItem === null && !overCard) hide();
    }, hideDelay);
  };

  return {
    enterItem(target) {
      overItem = target.key;
      if (suppressed) return;
      clearHide();
      if (state) {
        // A card is already open: follow the pointer without waiting again.
        clearShow();
        if (state.target.key !== target.key) show(target);
        return;
      }
      clearShow();
      showTimer = deps.setTimer(() => {
        showTimer = null;
        if (!suppressed && overItem === target.key) show(target);
      }, showDelay);
    },
    leaveItem() {
      overItem = null;
      clearShow();
      if (state) scheduleHide();
    },
    enterCard() {
      if (!state) return;
      overCard = true;
      clearHide();
    },
    leaveCard() {
      overCard = false;
      if (state) scheduleHide();
    },
    hide,
    setSuppressed(next) {
      suppressed = next;
      if (next) hide();
    },
    getState: () => state,
    dispose() {
      hide();
      overItem = null;
    },
  };
}
