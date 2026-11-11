// React binding for the sidebar hover preview controller (R18.1, R18.2).

import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import {
  createHoverPreview,
  loadPreview,
  previewTargetFor,
  type HoverPreviewController,
  type HoverPreviewState,
} from '../utils/hoverPreview';
import type { SidebarItemRef } from '../utils/sidebarModel';

export interface HoverPreview {
  state: HoverPreviewState | null;
  /** Mouse handlers for a sidebar item; they never prevent default, so drag handlers still run. */
  itemProps: (item: SidebarItemRef) => {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => void;
    onMouseLeave: () => void;
    onPointerDown: () => void;
  };
  cardProps: { onMouseEnter: () => void; onMouseLeave: () => void };
  hide: () => void;
}

export function useHoverPreview(suppressed: boolean): HoverPreview {
  const [state, setState] = useState<HoverPreviewState | null>(null);
  const ctrlRef = useRef<HoverPreviewController | null>(null);
  if (!ctrlRef.current) {
    ctrlRef.current = createHoverPreview({
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (h) => window.clearTimeout(h as number),
      load: (target) => loadPreview(target, window.neutrino),
      onChange: setState,
    });
  }
  const ctrl = ctrlRef.current;

  useEffect(() => ctrl.setSuppressed(suppressed), [ctrl, suppressed]);

  useEffect(() => {
    const hide = () => ctrl.hide();
    window.addEventListener('blur', hide);
    return () => {
      window.removeEventListener('blur', hide);
      ctrl.dispose();
    };
  }, [ctrl]);

  const itemProps = useCallback(
    (item: SidebarItemRef) => ({
      onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        ctrl.enterItem(previewTargetFor(item, { top: r.top, bottom: r.bottom, left: r.left, right: r.right }));
      },
      onMouseLeave: () => ctrl.leaveItem(),
      // A press (click or drag start) closes the card.
      onPointerDown: () => ctrl.hide(),
    }),
    [ctrl],
  );

  const cardProps = useRef({
    onMouseEnter: () => ctrl.enterCard(),
    onMouseLeave: () => ctrl.leaveCard(),
  }).current;

  const hide = useCallback(() => ctrl.hide(), [ctrl]);

  return { state, itemProps, cardProps, hide };
}
