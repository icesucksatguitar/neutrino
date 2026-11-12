// Pure browser-settings rules shared by the main process and the renderer.
// No Electron import: the renderer imports this module too (Vite resolves it), and tests run it directly.

import {
  type CustomSpaceThemePreset,
  type SpaceTheme,
  type SpaceThemesMap,
  getDefaultSpaceTheme,
  normalizeCustomThemePresets,
  normalizeSpaceThemesMap,
  validateAndClampSpaceTheme,
} from './spaceTheme';

export type { CustomSpaceThemePreset, SpaceTheme, SpaceThemesMap };

export type SearchEngineId = 'google' | 'duckduckgo' | 'bing' | 'brave';

export const SEARCH_ENGINES: Readonly<Record<SearchEngineId, { readonly label: string; readonly prefix: string }>> =
  Object.freeze({
    google: Object.freeze({ label: 'Google', prefix: 'https://www.google.com/search?q=' }),
    duckduckgo: Object.freeze({ label: 'DuckDuckGo', prefix: 'https://duckduckgo.com/?q=' }),
    bing: Object.freeze({ label: 'Bing', prefix: 'https://www.bing.com/search?q=' }),
    brave: Object.freeze({ label: 'Brave Search', prefix: 'https://search.brave.com/search?q=' }),
  });

export type ReducedEffectsMode = 'auto' | 'on' | 'off';

export interface PerformanceStatus {
  hardwareAcceleration: boolean;
  gpuDisabledFlag: boolean;
  softwareRasterized: boolean;
  reducedEffectsMode: ReducedEffectsMode;
  reducedEffectsActive: boolean;
  gpuFeatureStatus: Record<string, string>;
}

export function normalizeReducedEffectsMode(value: unknown): ReducedEffectsMode {
  return value === 'on' || value === 'off' || value === 'auto' ? value : 'auto';
}

function isStatusSoftwareOrDisabled(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  const lower = val.toLowerCase();
  return (
    lower.includes('software') ||
    lower.includes('disabled') ||
    lower === 'unavailable_off' ||
    lower === 'unavailable_software'
  );
}

export function isSoftwareGpuStatus(gpuStatus?: Record<string, unknown> | null): boolean {
  if (!gpuStatus || typeof gpuStatus !== 'object') return false;
  const direct3d = gpuStatus['direct_rendering_display_compositor'];
  const raster = gpuStatus['rasterization'];
  const comp = gpuStatus['gpu_compositing'];
  if (isStatusSoftwareOrDisabled(direct3d) || isStatusSoftwareOrDisabled(raster) || isStatusSoftwareOrDisabled(comp)) {
    return true;
  }
  return false;
}

export function resolveReducedEffectsActive(
  mode: unknown,
  gpuDisabledFlag: boolean,
  gpuStatus?: Record<string, unknown> | null
): boolean {
  const normalized = normalizeReducedEffectsMode(mode);
  if (normalized === 'on') return true;
  if (normalized === 'off') return false;
  return Boolean(gpuDisabledFlag) || isSoftwareGpuStatus(gpuStatus);
}

export interface BrowserSettings {
  adblockEnabled: boolean;
  zenSleepEnabled: boolean;
  searchEngine: SearchEngineId;
  reducedEffectsMode?: ReducedEffectsMode;
  spaceThemes?: SpaceThemesMap;
  customThemePresets?: CustomSpaceThemePreset[];
  shieldWhitelist?: string[];
  archiveIntervalHours: ArchiveIntervalHours;
  rightPinsDockVisible: boolean;
  sidebarExpanded: boolean;
  sidebarAutoHide: boolean;
  [unknownKey: string]: unknown; // kept as saved, e.g. the legacy `theme` key
}

/** How long an unused Today tab lives before it is archived. */
export type ArchiveIntervalHours = 12 | 24 | 168 | 720 | 'never';

export const ARCHIVE_INTERVAL_OPTIONS: readonly ArchiveIntervalHours[] = Object.freeze([12, 24, 168, 720, 'never']);

export const DEFAULT_SETTINGS: Readonly<BrowserSettings> = Object.freeze({
  adblockEnabled: true,
  zenSleepEnabled: true,
  searchEngine: 'google' as SearchEngineId,
  reducedEffectsMode: 'auto' as ReducedEffectsMode,
  archiveIntervalHours: 12 as ArchiveIntervalHours,
  rightPinsDockVisible: true,
  sidebarExpanded: true,
  sidebarAutoHide: false,
});

function isArchiveIntervalHours(value: unknown): value is ArchiveIntervalHours {
  return (ARCHIVE_INTERVAL_OPTIONS as readonly unknown[]).includes(value);
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function isSearchEngineId(value: unknown): value is SearchEngineId {
  return typeof value === 'string' && hasOwn(SEARCH_ENGINES, value);
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

function normalizeShieldDomain(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';
  try {
    const parsed = trimmed.includes('://') ? new URL(trimmed) : new URL(`https://${trimmed}`);
    return parsed.hostname.replace(/\.$/, '');
  } catch {
    return trimmed.replace(/^\.+|\.+$/g, '');
  }
}

function normalizeShieldWhitelist(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const item of raw) {
    const host = normalizeShieldDomain(item);
    if (host) seen.add(host);
  }
  return Array.from(seen).sort();
}

/** Fills missing or invalid fields with defaults, keeps unknown keys. Idempotent. */
export function normalizeSettings(raw: unknown): BrowserSettings {
  const source: Record<string, unknown> =
    raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    ...source,
    adblockEnabled: typeof source.adblockEnabled === 'boolean' ? source.adblockEnabled : DEFAULT_SETTINGS.adblockEnabled,
    zenSleepEnabled:
      typeof source.zenSleepEnabled === 'boolean' ? source.zenSleepEnabled : DEFAULT_SETTINGS.zenSleepEnabled,
    searchEngine: normalizeSearchEngine(source.searchEngine),
    reducedEffectsMode: normalizeReducedEffectsMode(source.reducedEffectsMode),
    spaceThemes: buildSpaceThemes(source.spaceThemes, source),
    customThemePresets: normalizeCustomThemePresets(source.customThemePresets),
    shieldWhitelist: normalizeShieldWhitelist(source.shieldWhitelist),
    archiveIntervalHours: isArchiveIntervalHours(source.archiveIntervalHours)
      ? source.archiveIntervalHours
      : DEFAULT_SETTINGS.archiveIntervalHours,
    rightPinsDockVisible: boolOr(source.rightPinsDockVisible, DEFAULT_SETTINGS.rightPinsDockVisible),
    sidebarExpanded: boolOr(source.sidebarExpanded, DEFAULT_SETTINGS.sidebarExpanded),
    sidebarAutoHide: boolOr(source.sidebarAutoHide, DEFAULT_SETTINGS.sidebarAutoHide),
  };
}
