// Trust-boundary helpers for the profile / space / layout IPC in index.ts
// (task 8.10). Pure: no Electron imports. Every value from the renderer is
// `unknown` until one of these accepts it.
import type { LayoutSection, MoveOp } from '../sidebar/layout';
import type { SpacePatch } from './store';

const MAX_ID_LENGTH = 200;
const MAX_NAME_LENGTH = 100;
const MAX_STYLE_LENGTH = 100;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A non-empty id string without control characters, or null. */
export function asId(v: unknown): string | null {
  if (typeof v !== 'string' || v.length === 0 || v.length > MAX_ID_LENGTH) return null;
  return CONTROL_CHARS.test(v) ? null : v;
}

/** A trimmed, non-empty display name of at most 100 characters, or null. */
export function asName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH || CONTROL_CHARS.test(trimmed)) return null;
  return trimmed;
}

/** A non-negative integer index, or null. */
export function asIndex(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;
}

function asStyle(v: unknown): string | null {
  if (typeof v !== 'string' || v.length === 0 || v.length > MAX_STYLE_LENGTH || CONTROL_CHARS.test(v)) return null;
  return v;
}

const SECTIONS: readonly LayoutSection[] = ['favorite', 'pinned', 'today'];

function asSection(v: unknown): LayoutSection | null {
  return typeof v === 'string' && (SECTIONS as readonly string[]).includes(v) ? (v as LayoutSection) : null;
}

/**
 * Validates a sidebar move. Space ids must be known; the moved id must be a
 * string (the layout model ignores unknown ids). Returns null when invalid.
 */
export function parseMoveOp(v: unknown, isKnownSpace: (spaceId: string) => boolean): MoveOp | null {
  if (!isRecord(v)) return null;
  const id = asId(v.id);
  if (!id) return null;
  if (v.type === 'reorder') {
    const section = asSection(v.section);
    const toIndex = asIndex(v.toIndex);
    if (!section || toIndex === null) return null;
    return { type: 'reorder', section, id, toIndex };
  }
  if (v.type === 'section') {
    const from = asSection(v.from);
    const to = asSection(v.to);
    const spaceId = asId(v.spaceId);
    if (!from || !to || !spaceId || !isKnownSpace(spaceId)) return null;
    if (v.toIndex === undefined) return { type: 'section', id, from, to, spaceId };
    const toIndex = asIndex(v.toIndex);
    if (toIndex === null) return null;
    return { type: 'section', id, from, to, spaceId, toIndex };
  }
  if (v.type === 'space') {
    const from = asSection(v.from);
    const targetSpaceId = asId(v.targetSpaceId);
    if (!from || !targetSpaceId || !isKnownSpace(targetSpaceId)) return null;
    return { type: 'space', id, from, targetSpaceId };
  }
  return null;
}

/**
 * Validates a space update (rename, recolor, icon). Unknown keys are ignored;
 * `order` is not accepted here (reorder has its own channel). Returns null
 * when a present field is invalid or nothing would change.
 */
export function parseSpacePatch(v: unknown): SpacePatch | null {
  if (!isRecord(v)) return null;
  const patch: SpacePatch = {};
  if (v.name !== undefined) {
    const name = asName(v.name);
    if (!name) return null;
    patch.name = name;
  }
  if (v.color !== undefined) {
    const color = asStyle(v.color);
    if (!color) return null;
    patch.color = color;
  }
  if (v.icon !== undefined) {
    const icon = asStyle(v.icon);
    if (!icon) return null;
    patch.icon = icon;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

export interface OpenerTab {
  id: string;
  spaceId: string;
  partition: string;
  url: string;
}

export interface OpenerInput {
  /** Live tabs. */
  tabs: readonly OpenerTab[];
  activeTab: OpenerTab | null;
  /** Partition whose session is the opener webContents' session, or null when unknown. */
  sessionPartition: string | null;
  /** Current URL of the opener webContents. */
  openerUrl: string;
  /** First space of the profile that owns `partition`, or null. */
  spaceForPartition: (partition: string) => string | null;
}

export interface OpenerContext {
  /** Partition for popups; undefined lets decideWindowOpen fall back to persist:neutrino. */
  partition: string | undefined;
  /** Tab whose space receives a link opened as a new tab. */
  activeTab: { spaceId: string } | null;
}

/**
 * Resolves webContents -> tab -> profile for setWindowOpenHandler (R3.1, R3.2).
 * The opener's session decides the profile. The tab is, in order: the active
 * tab when it is in that session and shows the opener URL, another tab in that
 * session showing the opener URL, the active tab when it is in that session,
 * and otherwise the first space of the session's profile.
 */
export function resolveOpener(input: OpenerInput): OpenerContext {
  const partition = input.sessionPartition ?? input.activeTab?.partition;
  if (!partition) return { partition: undefined, activeTab: input.activeTab };

  const active = input.activeTab && input.activeTab.partition === partition ? input.activeTab : null;
  const url = input.openerUrl;
  if (active && url && active.url === url) return { partition, activeTab: active };
  const byUrl = url ? input.tabs.find((t) => t.partition === partition && t.url === url) : undefined;
  if (byUrl) return { partition, activeTab: byUrl };
  if (active) return { partition, activeTab: active };
  const spaceId = input.spaceForPartition(partition);
  return { partition, activeTab: spaceId ? { spaceId } : input.activeTab };
}
