// Hover preview capture throttle and in-memory store. Pure: no Electron
// imports. The real `webContents.capturePage()` call is injected as a
// `CaptureFn`, so this module can be unit-tested without Electron.
//
// Previews are keyed by tab id (not URL). A sleeping or unloaded tab keeps
// its last preview; closing or archiving a tab deletes it (R18.5, R18.7).
// Capture does not depend on any drawer being open (R18.4).

export type CaptureReason = 'deactivation' | 'periodic';

/** Minimum gap between periodic captures of one tab (R18.3, decision A4). */
export const PERIODIC_CAPTURE_INTERVAL_MS = 30_000;

/**
 * Decide whether a capture request should run.
 * - 'deactivation' captures are always accepted.
 * - 'periodic' captures are accepted only if the tab has never been captured
 *   or the last capture is at least 30 s old.
 */
export function shouldCapture(
  lastCapturedAt: number | null | undefined,
  now: number,
  reason: CaptureReason,
): boolean {
  if (reason === 'deactivation') return true;
  if (lastCapturedAt == null) return true;
  return now - lastCapturedAt >= PERIODIC_CAPTURE_INTERVAL_MS;
}

export interface TabPreview {
  /** Encoded image, e.g. a `data:image/jpeg;base64,...` URL. */
  image: string;
  capturedAt: number;
}

/** In-memory preview store keyed by tab id. */
export class PreviewStore {
  private readonly previews = new Map<string, TabPreview>();

  set(tabId: string, preview: TabPreview): void {
    this.previews.set(tabId, preview);
  }

  get(tabId: string): TabPreview | undefined {
    return this.previews.get(tabId);
  }

  has(tabId: string): boolean {
    return this.previews.has(tabId);
  }

  /** A sleeping/unloaded tab keeps its last preview (R18.5). */
  onSleep(_tabId: string): void {
    // Intentionally a no-op: the preview stays available for hover.
  }

  /** Closing a tab deletes its preview (R18.7). */
  onClose(tabId: string): void {
    this.previews.delete(tabId);
  }

  /** Archiving a tab deletes its preview (R18.7). */
  onArchive(tabId: string): void {
    this.previews.delete(tabId);
  }

  get size(): number {
    return this.previews.size;
  }
}

/**
 * Captures the page image of a tab. Returns the encoded image, or null when
 * the tab cannot be captured (destroyed, not loaded, etc.).
 */
export type CaptureFn = (tabId: string) => Promise<string | null>;

/**
 * Combines the throttle, the store and an injected capture function.
 * Only awake tabs are captured; sleeping tabs keep their last preview.
 */
export class PreviewService {
  readonly store = new PreviewStore();
  private readonly asleep = new Set<string>();
  // Bumped on close/archive so an in-flight capture can't resurrect a preview.
  private readonly epochs = new Map<string, number>();

  constructor(
    private readonly capture: CaptureFn,
    private readonly clock: () => number = Date.now,
  ) {}

  /**
   * Request a capture. Resolves true when a new preview was stored.
   * Skips sleeping tabs and throttled periodic requests.
   */
  async requestCapture(tabId: string, reason: CaptureReason): Promise<boolean> {
    if (this.asleep.has(tabId)) return false;
    const now = this.clock();
    if (!shouldCapture(this.store.get(tabId)?.capturedAt, now, reason)) return false;

    const epoch = this.epochs.get(tabId) ?? 0;
    let image: string | null;
    try {
      image = await this.capture(tabId);
    } catch {
      return false;
    }
    if (!image) return false;
    // Tab was closed or archived while capturing.
    if ((this.epochs.get(tabId) ?? 0) !== epoch) return false;

    this.store.set(tabId, { image, capturedAt: now });
    return true;
  }

  get(tabId: string): TabPreview | undefined {
    return this.store.get(tabId);
  }

  onSleep(tabId: string): void {
    this.asleep.add(tabId);
    this.store.onSleep(tabId);
  }

  onWake(tabId: string): void {
    this.asleep.delete(tabId);
  }

  onClose(tabId: string): void {
    this.forget(tabId);
    this.store.onClose(tabId);
  }

  onArchive(tabId: string): void {
    this.forget(tabId);
    this.store.onArchive(tabId);
  }

  private forget(tabId: string): void {
    this.asleep.delete(tabId);
    this.epochs.set(tabId, (this.epochs.get(tabId) ?? 0) + 1);
  }
}
