// Pure browser-settings rules shared by the main process and the renderer.
// No Electron import: the renderer imports this module too (Vite resolves it), and tests run it directly.

import {
  type SpaceTheme,
  type SpaceThemesMap,
  getDefaultSpaceTheme,
  normalizeSpaceThemesMap,
  validateAndClampSpaceTheme,
} from './spaceTheme';

export type { SpaceTheme, SpaceThemesMap };

export type SearchEngineId = 'google' | 'duckduckgo' | 'bing' | 'brave';

export const SEARCH_ENGINES: Readonly<Record<SearchEngineId, { readonly label: string; readonly prefix: string }>> =
  Object.freeze({
    google: Object.freeze({ label: 'Google', prefix: 'https://www.google.com/search?q=' }),
    duckduckgo: Object.freeze({ label: 'DuckDuckGo', prefix: 'https://duckduckgo.com/?q=' }),
    bing: Object.freeze({ label: 'Bing', prefix: 'https://www.bing.com/search?q=' }),
    brave: Object.freeze({ label: 'Brave Search', prefix: 'https://search.brave.com/search?q=' }),
  });

export interface BrowserSettings {
  darkModeExclusions: string[];
  adblockEnabled: boolean;
  zenSleepEnabled: boolean;
  searchEngine: SearchEngineId;
  spaceThemes?: SpaceThemesMap;
  [unknownKey: string]: unknown; // kept as saved, e.g. the legacy `theme` key
}

export const DEFAULT_SETTINGS: Readonly<BrowserSettings> = Object.freeze({
  darkModeExclusions: Object.freeze(['youtube.com']) as unknown as string[],
  adblockEnabled: true,
  zenSleepEnabled: true,
  searchEngine: 'google' as SearchEngineId,
});

const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function isSearchEngineId(value: unknown): value is SearchEngineId {
  return typeof value === 'string' && hasOwn(SEARCH_ENGINES, value);
}

/** 1 to 253 chars, labels of [a-z0-9-] (1 to 63 chars, no leading or trailing '-'), at least one dot, or "localhost". */
function isValidHostname(host: string): boolean {
  if (host === 'localhost') return true;
  if (host.length < 1 || host.length > 253) return false;
  const labels = host.split('.');
  if (labels.length < 2) return false;
  return labels.every((label) => LABEL_RE.test(label));
}

/** Removes a leading "www." when what remains is still a valid hostname (so "www.com" stays as is). */
function stripWww(host: string): string {
  if (host.startsWith('www.')) {
    const rest = host.slice(4);
    if (isValidHostname(rest)) return rest;
  }
  return host;
}

/** Lowercase, trimmed, one trailing dot removed, leading "www." removed. */
function canonicalHost(host: string): string {
  let h = host.trim().toLowerCase();
  if (h.endsWith('.')) h = h.slice(0, -1);
  return stripWww(h);
}

/** Converts a non-ASCII hostname to punycode via the WHATWG URL parser; null when it cannot. */
function toAsciiHost(host: string): string | null {
  if (/^[\x00-\x7f]*$/.test(host)) return host;
  try {
    return new URL(`http://${host}/`).hostname;
  } catch {
    return null;
  }
}

/** "https://www.YouTube.com:443/watch?v=1" -> "youtube.com"; returns null when no valid hostname remains. */
export function normalizeHostEntry(input: string): string | null {
  if (typeof input !== 'string') return null;
  let s = input.trim().toLowerCase();
  if (!s || /\s/.test(s)) return null;

  // Scheme ("https://"), then the authority ends at the first path, query or fragment delimiter.
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  s = s.split(/[/?#]/, 1)[0];
  // User info ("user:pass@host").
  const at = s.lastIndexOf('@');
  if (at !== -1) s = s.slice(at + 1);
  // Port.
  s = s.replace(/:\d*$/, '');
  if (!s || s.includes(':')) return null;

  const ascii = toAsciiHost(s);
  if (ascii === null) return null;
  const host = canonicalHost(ascii);
  return isValidHostname(host) ? host : null;
}

/** host === entry || host.endsWith('.' + entry), both lowercased, leading "www." removed. */
export function hostMatches(host: string, entry: string): boolean {
  if (typeof host !== 'string' || typeof entry !== 'string') return false;
  const h = canonicalHost(host);
  const e = canonicalHost(entry);
  if (!h || !e) return false;
  return h === e || h.endsWith(`.${e}`);
}

function httpHostname(url: string): string | null {
  if (typeof url !== 'string' || !url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.hostname || null;
  } catch {
    return null;
  }
}

/** Host of an http(s) URL with a Host_Match in the list. False for other schemes or bad URLs. */
export function isHostExcluded(url: string, exclusions: readonly string[]): boolean {
  const host = httpHostname(url);
  if (!host) return false;
  return exclusions.some((entry) => hostMatches(host, entry));
}

/** Normalized host of an http(s) URL, or null. Used for the "this site" action. */
export function hostForExclusion(url: string): string | null {
  const host = httpHostname(url);
  return host ? normalizeHostEntry(host) : null;
}

export function addExclusion(list: readonly string[], input: string): { list: string[]; error?: 'invalid-host' } {
  const host = normalizeHostEntry(input);
  if (host === null) return { list: [...list], error: 'invalid-host' };
  if (list.includes(host)) return { list: [...list] };
  return { list: [...list, host] };
}

export function removeExclusion(list: readonly string[], entry: string): string[] {
  const normalized = normalizeHostEntry(entry);
  return list.filter((item) => item !== entry && item !== normalized);
}

/** Removes every entry matching the URL's host, or adds the host when none matches. */
export function toggleSiteExclusion(list: readonly string[], url: string): string[] {
  const host = hostForExclusion(url);
  if (host === null) return [...list];
  const remaining = list.filter((entry) => !hostMatches(host, entry));
  return remaining.length === list.length ? [...list, host] : remaining;
}

function encodeQuery(query: string): string {
  try {
    return encodeURIComponent(query);
  } catch {
    // Lone surrogates cannot be percent-encoded; replace them so the URL is still valid.
    return encodeURIComponent(query.replace(/[\uD800-\uDFFF]/g, '\uFFFD'));
  }
}

export function buildSearchUrl(engine: SearchEngineId, query: string): string {
  const id: SearchEngineId = isSearchEngineId(engine) ? engine : DEFAULT_SETTINGS.searchEngine;
  return SEARCH_ENGINES[id].prefix + encodeQuery(query);
}

function normalizeExclusions(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_SETTINGS.darkModeExclusions];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const host = normalizeHostEntry(item);
    if (host !== null && !out.includes(host)) out.push(host);
  }
  return out;
}

function normalizeSearchEngine(value: unknown): SearchEngineId {
  if (isSearchEngineId(value)) return value;
  if (typeof value === 'string') {
    // Legacy saved value: the full URL prefix (the old default was the Google prefix).
    const match = (Object.keys(SEARCH_ENGINES) as SearchEngineId[]).find((id) => SEARCH_ENGINES[id].prefix === value);
    if (match) return match;
  }
  return DEFAULT_SETTINGS.searchEngine;
}

const DEFAULT_SPACE_IDS = ['space-study', 'space-work', 'space-leisure'] as const;

function buildSpaceThemes(rawMap: unknown, source: Record<string, unknown>): SpaceThemesMap {
  const hasExplicitLegacyOverride =
    source.theme === 'light' ||
    (source.customTheme !== null && typeof source.customTheme === 'object' && !Array.isArray(source.customTheme));

  const legacyContext = hasExplicitLegacyOverride ? source : undefined;
  const normalized = normalizeSpaceThemesMap(rawMap, legacyContext);

  if (Object.keys(normalized).length === 0) {
    for (const spaceId of DEFAULT_SPACE_IDS) {
      normalized[spaceId] = getDefaultSpaceTheme(spaceId, legacyContext);
    }
  }
  return normalized;
}

export function resolveSpaceTheme(settings: BrowserSettings | Record<string, unknown>, spaceId: string): SpaceTheme {
  const src = settings as Record<string, unknown>;
  const hasExplicitLegacyOverride =
    src.theme === 'light' ||
    (src.customTheme !== null && typeof src.customTheme === 'object' && !Array.isArray(src.customTheme));
  const fallback = getDefaultSpaceTheme(spaceId, hasExplicitLegacyOverride ? src : undefined);
  const map = src.spaceThemes as Record<string, unknown> | undefined;
  if (map && typeof map === 'object' && !Array.isArray(map) && hasOwn(map, spaceId)) {
    return validateAndClampSpaceTheme(map[spaceId], fallback);
  }
  return fallback;
}

/** Fills missing or invalid fields with defaults, keeps unknown keys. Idempotent. */
export function normalizeSettings(raw: unknown): BrowserSettings {
  const source: Record<string, unknown> =
    raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    ...source,
    darkModeExclusions: normalizeExclusions(source.darkModeExclusions),
    adblockEnabled: typeof source.adblockEnabled === 'boolean' ? source.adblockEnabled : DEFAULT_SETTINGS.adblockEnabled,
    zenSleepEnabled:
      typeof source.zenSleepEnabled === 'boolean' ? source.zenSleepEnabled : DEFAULT_SETTINGS.zenSleepEnabled,
    searchEngine: normalizeSearchEngine(source.searchEngine),
    spaceThemes: buildSpaceThemes(source.spaceThemes, source),
  };
}
