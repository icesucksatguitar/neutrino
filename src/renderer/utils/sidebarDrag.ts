// Pure drag-and-drop helpers for the sidebar (R17). No React, no DOM access:
// the hook in `hooks/useSidebarDrag.ts` measures elements and feeds plain
// rects and points in, so everything here is unit testable in node.
//
// Indices are always "among the other items" of the target section, i.e. the
// dragged item is left out. That is exactly the post-removal index `move`
// expects for a reorder and the insertion index for a section change, and it
// keeps the computed index stable while the optimistic preview moves the
// dragged item around.

import { beginDrag, cancelDrag, move, type DragSnapshot } from '../../main/sidebar/layout';
import type { ProfilesFile } from '../../main/profiles/types';
import type { MoveOp, TabState } from '../types';
import type { SidebarItemKind, SidebarSource } from './sidebarModel';

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** `list`: one item per row (pinned, Today). `grid`: rows that wrap (Favorites_Grid). */
export type DropLayout = 'list' | 'grid';

/** Pixels the pointer must travel before a press becomes a drag. */
export const DRAG_THRESHOLD_PX = 4;

export function passedThreshold(dx: number, dy: number, threshold = DRAG_THRESHOLD_PX): boolean {
  return dx * dx + dy * dy >= threshold * threshold;
}

/**
 * Insertion index for a pointer at (x, y) among `rects` (in DOM order). A list
 * item counts as "before" the pointer when the pointer is below its vertical
 * midpoint. A grid item counts as before when it sits in an earlier row, or in
 * the pointer's row with its horizontal midpoint left of the pointer.
 */
export function insertionIndex(rects: readonly Rect[], x: number, y: number, layout: DropLayout): number {
  let index = 0;
  for (const r of rects) {
    const before =
      layout === 'list'
        ? y > (r.top + r.bottom) / 2
        : y > r.bottom || (y >= r.top && x > (r.left + r.right) / 2);
    if (before) index += 1;
    else if (layout === 'list') break;
  }
  return index;
}

export interface DragSource {
  kind: SidebarItemKind;
  id: string;
  /** Position within its section in the layout shown when the drag started. */
  index: number;
}

export type DropTarget =
  | { type: 'section'; section: SidebarItemKind; index: number }
  | { type: 'space'; spaceId: string };

export function sameTarget(a: DropTarget | null, b: DropTarget | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.type === 'space') return b.type === 'space' && a.spaceId === b.spaceId;
  return b.type === 'section' && a.section === b.section && a.index === b.index;
}

/**
 * Move operation for dropping `source` (shown in `activeSpaceId`'s sidebar) on
 * `target`, or null when the drop changes nothing.
 */
export function dropOp(source: DragSource, target: DropTarget | null, activeSpaceId: string): MoveOp | null {
  if (target === null) return null;
  if (target.type === 'space') {
    // Pinned and Today rows already live in the active space.
    if (source.kind !== 'favorite' && target.spaceId === activeSpaceId) return null;
    return { type: 'space', id: source.id, from: source.kind, targetSpaceId: target.spaceId };
  }
  const index = Math.max(0, Math.trunc(target.index));
  if (target.section === source.kind) {
    if (index === source.index) return null;
    return { type: 'reorder', section: source.kind, id: source.id, toIndex: index };
  }
  return {
    type: 'section',
    id: source.id,
    from: source.kind,
    to: target.section,
    spaceId: activeSpaceId,
    toIndex: index,
  };
}

// ---------------------------------------------------------------------------
// Drag session: snapshot + optimistic preview

export interface DragSession {
  snapshot: DragSnapshot;
  source: DragSource;
  activeSpaceId: string;
  target: DropTarget | null;
  op: MoveOp | null;
  /** Layout shown while dragging: `move(snapshot, op)`, or the snapshot itself. */
  preview: ProfilesFile;
}

export function startDragSession(file: ProfilesFile, source: DragSource, activeSpaceId: string): DragSession {
  const snapshot = beginDrag(file);
  return { snapshot, source, activeSpaceId, target: null, op: null, preview: snapshot.file };
}

/** Points the session at a new target and recomputes the optimistic preview. */
export function retargetDragSession(session: DragSession, target: DropTarget | null): DragSession {
  if (sameTarget(session.target, target)) return session;
  const op = dropOp(session.source, target, session.activeSpaceId);
  const preview = op ? move(session.snapshot.file, op).file : session.snapshot.file;
  return { ...session, target, op, preview };
}

/** Escape / failed commit: the layout from before the drag (R17.7). */
export function cancelDragSession(session: DragSession): ProfilesFile {
  return cancelDrag(session.snapshot);
}

// ---------------------------------------------------------------------------
// Rendering a ProfilesFile through the renderer state shape

function placeholderTab(id: string, url: string, title: string): TabState {
  return {
    id,
    spaceId: '',
    title,
    url,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    isPinned: false,
    isSleeping: false,
    blockedCount: 0,
  };
}

/**
 * Returns `src` with its tab sections/order and favorites replaced by `file`'s
 * layout, so `buildSidebarView` renders the optimistic layout. Live tab fields
 * (loading, sleeping, partition, ...) come from `src`.
 */
export function withLayout(src: SidebarSource, file: ProfilesFile): SidebarSource {
  const byId = new Map(src.tabs.map((t) => [t.id, t]));
  // Every list's `order` values increase along the list, so a stable global
  // sort keeps the order within each list, which is all toProfilesFile reads.
  const entries = [...file.tabs].sort((a, b) => a.order - b.order);
  const tabs = entries.map((e): TabState => {
    const live = byId.get(e.id) ?? {
      ...placeholderTab(e.id, e.url, e.title),
      ...(e.favicon !== undefined ? { favicon: e.favicon } : {}),
      unloaded: true,
    };
    return { ...live, spaceId: e.spaceId, section: e.section, isPinned: e.section === 'pinned' };
  });
  return { ...src, tabs, favorites: file.favorites };
}

/** Whether a `moveTab` IPC result reports failure. Unknown shapes count as success. */
export function isFailedMoveResult(result: unknown): boolean {
  return typeof result === 'object' && result !== null && (result as { ok?: unknown }).ok === false;
}
