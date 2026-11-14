// Persistent local browsing history store. Pure Node (no Electron imports).
import { readJsonSafeSync, writeFileAtomicSync } from './atomicFile';

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  timestamp: number;
  visitCount: number;
  favicon?: string;
  spaceId?: string;
}

export type HistoryClearRange = 'hour' | 'day' | 'all';

export interface RecordVisitInput {
  url: string;
  title?: string;
  favicon?: string;
  spaceId?: string;
  timestamp?: number;
}

export interface HistoryQueryOptions {
  query?: string;
  limit?: number;
  offset?: number;
  spaceId?: string;
}

export const DEFAULT_MAX_HISTORY_ENTRIES = 3000;
const CONSECUTIVE_DEDUP_WINDOW_MS = 5 * 60 * 1000;
const TITLE_UPDATE_WINDOW_MS = 10 * 60 * 1000;

/** Schemes allowed in browsing history; internal/ephemeral URLs are excluded. */
export function isRecordableHistoryUrl(url: string): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('neutrino://') ||
    lower.startsWith('about:') ||
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('blob:') ||
    lower.startsWith('devtools:') ||
    lower.startsWith('chrome:') ||
    lower.startsWith('chrome-extension:')
  ) {
    return false;
  }
  return lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('file://');
}

/** Derives a human-readable fallback title when a page title is not yet known. */
export function deriveFallbackTitle(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'file:') {
      const segments = parsed.pathname.split('/').filter(Boolean);
      return segments[segments.length - 1] || url;
    }
    return parsed.hostname || url;
  } catch {
    return url;
  }
}

function normalizeEntry(raw: unknown, fallbackIndex: number): HistoryEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const url = typeof rec.url === 'string' ? rec.url.trim() : '';
  if (!isRecordableHistoryUrl(url)) return null;
  const timestamp =
    typeof rec.timestamp === 'number' && Number.isFinite(rec.timestamp) && rec.timestamp > 0
      ? rec.timestamp
      : Date.now();
  const titleRaw = typeof rec.title === 'string' ? rec.title.trim() : '';
  const title = titleRaw || deriveFallbackTitle(url);
  const visitCount =
    typeof rec.visitCount === 'number' && Number.isFinite(rec.visitCount) && rec.visitCount >= 1
      ? Math.floor(rec.visitCount)
      : 1;
  const id = typeof rec.id === 'string' && rec.id.trim() ? rec.id : `hist-${timestamp}-${fallbackIndex}`;
  const entry: HistoryEntry = { id, url, title, timestamp, visitCount };
  if (typeof rec.favicon === 'string' && rec.favicon.trim()) entry.favicon = rec.favicon.trim();
  if (typeof rec.spaceId === 'string' && rec.spaceId.trim()) entry.spaceId = rec.spaceId.trim();
  return entry;
}

function cloneEntry(entry: HistoryEntry): HistoryEntry {
  return { ...entry };
}

/** Manages recording, deduplication, searching, deletion, and atomic persistence of history. */
export class HistoryManager {
  private readonly filePath: string | null;
  private readonly maxEntries: number;
  private readonly debounceMs: number;
  private entries: HistoryEntry[] = [];
  private seq = 0;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(entries: HistoryEntry[]) => void>();

  constructor(
    filePath: string | null,
    options?: { maxEntries?: number; debounceMs?: number },
  ) {
    this.filePath = filePath;
    this.maxEntries = Math.max(10, options?.maxEntries ?? DEFAULT_MAX_HISTORY_ENTRIES);
    this.debounceMs = Math.max(0, options?.debounceMs ?? 80);
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    if (!this.filePath) return;
    const raw = readJsonSafeSync<{ entries?: unknown[] } | unknown[]>(this.filePath, []);
    const rawList = Array.isArray(raw) ? raw : Array.isArray(raw?.entries) ? raw.entries : [];
    const normalized: HistoryEntry[] = [];
    for (let i = 0; i < rawList.length; i++) {
      const item = normalizeEntry(rawList[i], i);
      if (item) normalized.push(item);
    }
    normalized.sort((a, b) => b.timestamp - a.timestamp);
    this.entries = normalized.slice(0, this.maxEntries);
  }

  private scheduleSave(immediate = false): void {
    if (!this.filePath) return;
    if (immediate || this.debounceMs === 0) {
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
      }
      this.flush();
      return;
    }
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, this.debounceMs);
  }

  private emitChange(): void {
    if (this.listeners.size === 0) return;
    const snapshot = this.getEntries({ limit: 500 });
    for (const cb of this.listeners) {
      try {
        cb(snapshot);
      } catch {}
    }
  }

  /** Subscribes to history changes; returns an unsubscribe callback. */
  public onChange(cb: (entries: HistoryEntry[]) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** Records a page visit, collapsing consecutive duplicate navigations within a short window. */
  public recordVisit(input: RecordVisitInput): HistoryEntry | null {
    if (!isRecordableHistoryUrl(input.url)) return null;
    const url = input.url.trim();
    const ts = typeof input.timestamp === 'number' && Number.isFinite(input.timestamp) ? input.timestamp : Date.now();
    const rawTitle = typeof input.title === 'string' ? input.title.trim() : '';
    const title = rawTitle || deriveFallbackTitle(url);

    const head = this.entries[0];
    if (head && head.url === url && Math.abs(ts - head.timestamp) <= CONSECUTIVE_DEDUP_WINDOW_MS) {
      head.timestamp = Math.max(ts, head.timestamp);
      head.visitCount += 1;
      if (rawTitle && rawTitle !== url && rawTitle !== 'New Tab') {
        head.title = rawTitle;
      }
      if (input.favicon) head.favicon = input.favicon;
      if (input.spaceId) head.spaceId = input.spaceId;
      this.scheduleSave(false);
      this.emitChange();
      return cloneEntry(head);
    }

    const entry: HistoryEntry = {
      id: `hist-${ts}-${++this.seq}`,
      url,
      title,
      timestamp: ts,
      visitCount: 1,
      ...(input.favicon ? { favicon: input.favicon } : {}),
      ...(input.spaceId ? { spaceId: input.spaceId } : {}),
    };

    this.entries.unshift(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.length = this.maxEntries;
    }
    // Persist new URL visits immediately so short sessions never lose entries.
    this.scheduleSave(true);
    this.emitChange();
    return cloneEntry(entry);
  }

  /** Updates the title or favicon of a recently visited entry for url. */
  public updateMetadata(
    url: string,
    meta: { title?: string; favicon?: string },
    now = Date.now(),
  ): HistoryEntry | null {
    if (!isRecordableHistoryUrl(url)) return null;
    const targetUrl = url.trim();
    const scanLimit = Math.min(this.entries.length, 15);
    for (let i = 0; i < scanLimit; i++) {
      const entry = this.entries[i];
      if (entry.url !== targetUrl) continue;
      if (Math.abs(now - entry.timestamp) > TITLE_UPDATE_WINDOW_MS) continue;
      let changed = false;
      const nextTitle = typeof meta.title === 'string' ? meta.title.trim() : '';
      if (nextTitle && nextTitle !== 'New Tab' && nextTitle !== entry.title) {
        entry.title = nextTitle;
        changed = true;
      }
      const nextFavicon = typeof meta.favicon === 'string' ? meta.favicon.trim() : '';
      if (nextFavicon && nextFavicon !== entry.favicon) {
        entry.favicon = nextFavicon;
        changed = true;
      }
      if (changed) {
        this.scheduleSave(false);
        this.emitChange();
      }
      return cloneEntry(entry);
    }
    return null;
  }

  /** Searches and returns history entries sorted newest-first. */
  public getEntries(options?: HistoryQueryOptions): HistoryEntry[] {
    const query = typeof options?.query === 'string' ? options.query.trim().toLowerCase() : '';
    const terms = query ? query.split(/\s+/).filter(Boolean) : [];
    const spaceId = options?.spaceId;
    const offset = Math.max(0, options?.offset ?? 0);
    const limit = Math.max(1, Math.min(options?.limit ?? 500, this.maxEntries));

    const filtered: HistoryEntry[] = [];
    for (const entry of this.entries) {
      if (spaceId && entry.spaceId !== spaceId) continue;
      if (terms.length > 0) {
        const haystack = `${entry.title}\n${entry.url}`.toLowerCase();
        if (!terms.every((t) => haystack.includes(t))) continue;
      }
      filtered.push(entry);
    }
    return filtered.slice(offset, offset + limit).map(cloneEntry);
  }

  /** Deletes one entry by id (or url + timestamp fallback). */
  public deleteEntry(target: { id?: string; url?: string; timestamp?: number }): boolean {
    const idx = this.entries.findIndex((entry) => {
      if (target.id && entry.id === target.id) return true;
      if (target.url && typeof target.timestamp === 'number') {
        return entry.url === target.url && entry.timestamp === target.timestamp;
      }
      return false;
    });
    if (idx === -1) return false;
    this.entries.splice(idx, 1);
    this.scheduleSave(true);
    this.emitChange();
    return true;
  }

  /** Removes history entries within the requested time window and returns count deleted. */
  public clear(range: HistoryClearRange = 'all', now = Date.now()): number {
    const before = this.entries.length;
    if (range === 'all') {
      this.entries = [];
    } else {
      const cutoff = range === 'hour' ? now - 60 * 60 * 1000 : now - 24 * 60 * 60 * 1000;
      this.entries = this.entries.filter((entry) => entry.timestamp < cutoff);
    }
    const removed = before - this.entries.length;
    if (removed > 0 || range === 'all') {
      this.scheduleSave(true);
      this.emitChange();
    }
    return removed;
  }

  /** Flushes any pending write atomically to disk. */
  public flush(): void {
    if (!this.filePath) return;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      writeFileAtomicSync(
        this.filePath,
        JSON.stringify({ version: 1, entries: this.entries }, null, 2),
      );
    } catch (e) {
      console.error('Failed to flush history file:', e);
    }
  }

  /** Cancels timers after flushing pending changes. */
  public destroy(): void {
    this.flush();
  }
}

