// Pointer-driven drag and drop for the sidebar (R17).
//
// Pointer events (not HTML5 drag and drop) keep the drag alive while the
// optimistic preview re-parents the dragged row between sections, and let
// Escape cancel the drag. While dragging, the sidebar renders
// `move(snapshot, op)` (an optimistic layout); the drop sends one `moveTab`
// and keeps that layout until the next `state-update`. Escape, a release
// outside any target, or a failed `moveTab` restore the original layout.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import type { ProfilesFile } from '../../main/profiles/types';
import {
  cancelDragSession,
  insertionIndex,
  isFailedMoveResult,
  passedThreshold,
  retargetDragSession,
  startDragSession,
  withLayout,
  type DragSession,
  type DropTarget,
  type Rect,
} from '../utils/sidebarDrag';
import { toProfilesFile, type SidebarItemKind, type SidebarItemRef, type SidebarSource } from '../utils/sidebarModel';
import type { MoveOp } from '../types';

/** How long an optimistic layout waits for a `state-update` after a successful commit. */
const COMMIT_SETTLE_MS = 2000;

/** Same shape as Sidebar's `ExtraProps`. */
type DragItemProps = Omit<React.HTMLAttributes<HTMLElement>, 'draggable'> & {
  draggable?: boolean;
  [data: `data-${string}`]: unknown;
};

interface Press {
  item: SidebarItemRef;
  x: number;
  y: number;
  root: HTMLElement | null;
}

interface Committed {
  file: ProfilesFile;
  /** `state` when the drop happened; a different `state` means main has answered. */
  base: SidebarSource;
  settled: boolean;
  gen: number;
}

export interface SidebarDragGhost {
  item: SidebarItemRef;
  x: number;
  y: number;
}

export interface SidebarDrag {
  /** State to render: the optimistic layout while dragging or committing, else `state`. */
  displayState: SidebarSource;
  dragging: boolean;
  draggedId: string | null;
  target: DropTarget | null;
  /** Initial ghost position; later moves update `ghostRef` directly. */
  ghost: SidebarDragGhost | null;
  ghostRef: React.RefObject<HTMLDivElement>;
  itemProps: (item: SidebarItemRef) => DragItemProps;
  spaceProps: (spaceId: string) => DragItemProps;
}

/** Drop target under the pointer; `undefined` keeps the previous target (pointer between targets). */
function targetAt(x: number, y: number, draggedId: string, root: HTMLElement | null): DropTarget | null | undefined {
  const el = document.elementFromPoint(x, y);
  if (!el || !root || !root.contains(el)) return null;
  const spaceEl = el.closest<HTMLElement>('[data-space-id]');
  if (spaceEl && root.contains(spaceEl)) {
    const spaceId = spaceEl.getAttribute('data-space-id');
    return spaceId ? { type: 'space', spaceId } : undefined;
  }
  const sectionEl = el.closest<HTMLElement>('[data-sidebar-section]');
  if (!sectionEl) return undefined;
  const section = sectionEl.getAttribute('data-sidebar-section') as SidebarItemKind | null;
  if (section !== 'favorite' && section !== 'pinned' && section !== 'today') return undefined;
  const rects: Rect[] = Array.from(sectionEl.querySelectorAll<HTMLElement>('[data-sidebar-item]'))
    .filter((n) => n.getAttribute('data-sidebar-id') !== draggedId)
    .map((n) => n.getBoundingClientRect());
  return { type: 'section', section, index: insertionIndex(rects, x, y, section === 'favorite' ? 'grid' : 'list') };
}

export function useSidebarDrag(state: SidebarSource, moveTab: (op: MoveOp) => unknown): SidebarDrag {
  const [session, setSession] = useState<DragSession | null>(null);
  const [committed, setCommitted] = useState<Committed | null>(null);
  const [ghost, setGhost] = useState<SidebarDragGhost | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);

  const stateRef = useRef(state);
  stateRef.current = state;
  const committedRef = useRef(committed);
  committedRef.current = committed;
  const sessionRef = useRef<DragSession | null>(null);
  const pressRef = useRef<Press | null>(null);
  const suppressClickRef = useRef(false);
  const genRef = useRef(0);
  const detachRef = useRef<(() => void) | null>(null);
  const moveTabRef = useRef(moveTab);
  moveTabRef.current = moveTab;

  const setSessionBoth = (s: DragSession | null) => {
    sessionRef.current = s;
    setSession(s);
  };

  const finish = useCallback(() => {
    detachRef.current?.();
    detachRef.current = null;
    pressRef.current = null;
    setSessionBoth(null);
    setGhost(null);
  }, []);

  /** Escape, blur or release outside a target: nothing moves (R17.7). */
  const cancel = useCallback(() => {
    const s = sessionRef.current;
    if (s) cancelDragSession(s); // the snapshot layout is what `state` already shows
    finish();
  }, [finish]);

  const commit = useCallback(() => {
    const s = sessionRef.current;
    finish();
    if (!s || !s.op) return;
    const gen = ++genRef.current;
    setCommitted({ file: s.preview, base: stateRef.current, settled: false, gen });
    const revert = () => setCommitted((c) => (c && c.gen === gen ? null : c));
    let result: unknown;
    try {
      result = moveTabRef.current(s.op);
    } catch {
      revert();
      return;
    }
    Promise.resolve(result).then(
      (res) => {
        if (isFailedMoveResult(res)) {
          revert();
          return;
        }
        setCommitted((c) => {
          if (!c || c.gen !== gen) return c;
          return stateRef.current !== c.base ? null : { ...c, settled: true };
        });
        window.setTimeout(revert, COMMIT_SETTLE_MS);
      },
      revert,
    );
  }, [finish]);

  // A settled commit gives way to the next state-update from main.
  useEffect(() => {
    if (committed?.settled && state !== committed.base) setCommitted(null);
  }, [state, committed]);

  useEffect(() => () => detachRef.current?.(), []);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const press = pressRef.current;
      if (!press) return;
      if (e.buttons === 0) {
        // The release happened somewhere we did not see (for example over the page).
        cancel();
        return;
      }
      let s = sessionRef.current;
      if (!s) {
        if (!passedThreshold(e.clientX - press.x, e.clientY - press.y)) return;
        const shown = committedRef.current ? withLayout(stateRef.current, committedRef.current.file) : stateRef.current;
        s = startDragSession(
          toProfilesFile(shown),
          { kind: press.item.kind, id: press.item.id, index: press.item.index },
          stateRef.current.activeSpaceId,
        );
        setGhost({ item: press.item, x: e.clientX, y: e.clientY });
      }
      const t = targetAt(e.clientX, e.clientY, press.item.id, press.root);
      const next = t === undefined ? s : retargetDragSession(s, t);
      if (next !== sessionRef.current) setSessionBoth(next);
      if (ghostRef.current) {
        ghostRef.current.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 8}px)`;
      }
    },
    [cancel],
  );

  const onPointerUp = useCallback(() => {
    if (!sessionRef.current) {
      finish();
      return;
    }
    // The click that follows this pointerup must not activate the item.
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
    commit();
  }, [commit, finish]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !sessionRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      cancel();
    },
    [cancel],
  );

  const attach = useCallback(() => {
    detachRef.current?.();
    const blur = () => cancel();
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', blur);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', blur);
    detachRef.current = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', blur);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', blur);
    };
  }, [cancel, onKeyDown, onPointerMove, onPointerUp]);

  const draggedId = session?.source.id ?? null;
  const target = session?.target ?? null;

  const itemProps = useCallback(
    (item: SidebarItemRef): DragItemProps => {
      const isDragged = draggedId === item.id;
      const indicator = isDragged && target?.type === 'section';
      return {
        onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
          if (e.button !== 0 || e.pointerType === 'touch') return;
          const fromControl = (e.target as HTMLElement).closest('button, input, a');
          if (fromControl && e.currentTarget.contains(fromControl)) return;
          pressRef.current = {
            item,
            x: e.clientX,
            y: e.clientY,
            root: e.currentTarget.closest<HTMLElement>('aside') ?? e.currentTarget.parentElement,
          };
          attach();
        },
        onClick: (e: React.MouseEvent) => {
          if (suppressClickRef.current) e.preventDefault();
        },
        // Native image/link drags would steal the pointer stream.
        onDragStart: (e: React.DragEvent) => e.preventDefault(),
        draggable: false,
        className: [isDragged ? 'nsb-dragging-item' : '', indicator ? 'nsb-drop-indicator' : '']
          .filter(Boolean)
          .join(' ') || undefined,
        ...(indicator ? { 'data-drop-indicator': 'true' } : {}),
      };
    },
    [attach, draggedId, target],
  );

  const spaceProps = useCallback(
    (spaceId: string): DragItemProps => {
      const over = target?.type === 'space' && target.spaceId === spaceId;
      return over ? { className: 'nsb-drop-space', 'data-drop-target': 'true' } : {};
    },
    [target],
  );

  const preview = session ? session.preview : committed?.file ?? null;
  const displayState = useMemo(() => (preview ? withLayout(state, preview) : state), [state, preview]);

  return {
    displayState,
    dragging: session !== null,
    draggedId,
    target,
    ghost,
    ghostRef,
    itemProps,
    spaceProps,
  };
}
