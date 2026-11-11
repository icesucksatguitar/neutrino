// Arc-style swipe between spaces. A two-finger horizontal wheel gesture moves the
// pane track 1:1 (refs + rAF, no React state per frame); on release it snaps to
// the neighbouring space or springs back. External space changes (clicking a
// space icon, Ctrl+N) play the same slide. Gesture math lives in utils/spaceSwipe.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import {
  GESTURE_END_MS,
  SNAP_MS,
  decideTarget,
  easeOutCubic,
  estimateVelocity,
  lockAxis,
  resolveOffset,
  settleOffset,
  type SwipeAxis,
} from '../utils/spaceSwipe';

export interface SwipeSpace {
  id: string;
  color: string;
}

export interface SpaceSwipeOptions {
  /** Element receiving the wheel events; also carries `--nsb-space-color`. */
  rootRef: RefObject<HTMLElement>;
  /** The three-pane track. Its parent is the clipping viewport. */
  trackRef: RefObject<HTMLElement>;
  order: readonly SwipeSpace[];
  activeId: string;
  /** True while dragging a tab or with the context menu open: no swipes start. */
  blocked: boolean;
  /** Called once, when the snap animation completes on another space. */
  onCommit: (spaceId: string) => void;
  /** Called when a swipe starts (hide hover previews). */
  onStart: () => void;
}

/** A space shown in an adjacent slot while a click/shortcut slide plays. */
export interface OutgoingSpace {
  id: string;
  side: 'prev' | 'next';
}

type Phase = 'idle' | 'drag' | 'anim' | 'pending';

/** shortcut: if main never answers selectSpace, give up waiting after this and spring back. */
const PENDING_TIMEOUT_MS = 800;
const TINT_VAR = '--nsb-space-color';

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

export function useSpaceSwipe(opts: SpaceSwipeOptions): OutgoingSpace | null {
  const [outgoing, setOutgoing] = useState<OutgoingSpace | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const s = useRef({
    phase: 'idle' as Phase,
    axis: null as SwipeAxis | 'spent' | null,
    accX: 0,
    accY: 0,
    raw: 0,
    lastAt: 0,
    width: 0,
    index: 0,
    offset: 0,
    samples: [] as { t: number; x: number }[],
    vHist: [] as { t: number; v: number }[],
    reduced: false,
    otherColor: null as string | null, // colour slid away from during an external slide
    raf: 0,
    frame: 0,
    endTimer: 0,
    pendingTimer: 0,
    pendingId: null as string | null,
    prevActive: opts.activeId,
  }).current;

  const setTint = (offset: number) => {
    const { order, activeId, rootRef } = optsRef.current;
    const root = rootRef.current;
    if (!root) return;
    const i = order.findIndex((x) => x.id === activeId);
    const own = order[i]?.color;
    if (!own) return;
    const other = s.otherColor ?? order[i + (offset < 0 ? 1 : -1)]?.color;
    const p = Math.min(1, Math.abs(offset) / (s.width || 1));
    root.style.setProperty(TINT_VAR, other && p > 0 ? `color-mix(in srgb, ${other} ${(p * 100).toFixed(1)}%, ${own})` : own);
  };

  const plainTint = (id: string) => {
    const { order, rootRef } = optsRef.current;
    const color = order.find((x) => x.id === id)?.color;
    if (color) rootRef.current?.style.setProperty(TINT_VAR, color);
  };

  const apply = (offset: number) => {
    s.offset = offset;
    const track = optsRef.current.trackRef.current;
    if (track) track.style.transform = `translate3d(${offset - s.width}px,0,0)`;
    setTint(offset);
  };

  const stopAnim = () => {
    cancelAnimationFrame(s.raf);
    cancelAnimationFrame(s.frame);
    s.raf = 0;
    s.frame = 0;
  };

  const animate = (to: number, done: () => void) => {
    stopAnim();
    const from = s.offset;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / SNAP_MS);
      apply(from + (to - from) * easeOutCubic(p));
      if (p < 1) s.raf = requestAnimationFrame(step);
      else {
        s.raf = 0;
        done();
      }
    };
    s.raf = requestAnimationFrame(step);
  };

  /** Back to the resting layout (CSS default transform) with the current space's tint. */
  const rest = () => {
    stopAnim();
    const { trackRef, activeId } = optsRef.current;
    if (trackRef.current) trackRef.current.style.transform = '';
    s.offset = 0;
    s.otherColor = null;
    s.phase = 'idle';
    s.pendingId = null;
    window.clearTimeout(s.pendingTimer);
    plainTint(activeId);
  };

  const springBack = () => {
    s.phase = 'anim';
    animate(0, rest);
  };

  const finishGesture = () => {
    if (s.phase !== 'drag') return;
    const { order, onCommit, activeId } = optsRef.current;
    const last = s.samples[s.samples.length - 1];
    const cutoff = (last?.t ?? 0) - 300;
    // Momentum tails decay, so the release speed is the fastest recent window.
    const velocity = s.vHist.filter((h) => h.t >= cutoff).reduce((m, h) => (Math.abs(h.v) > Math.abs(m) ? h.v : m), 0);
    const offset = resolveOffset(s.raw, s.index, order.length, s.width);
    const target = decideTarget({ offset, velocity, width: s.width, index: s.index, count: order.length });
    const targetId = order[target]?.id;
    if (target === s.index || !targetId || targetId === activeId) {
      if (s.reduced) rest();
      else springBack();
      return;
    }
    if (s.reduced) {
      rest();
      onCommit(targetId);
      return;
    }
    s.phase = 'anim';
    animate(settleOffset(target, s.index, s.width), () => {
      // Hold the slid position until the state change lands (see the layout effect).
      s.phase = 'pending';
      s.pendingId = targetId;
      plainTint(targetId);
      s.pendingTimer = window.setTimeout(() => {
        if (s.phase === 'pending') springBack();
      }, PENDING_TIMEOUT_MS);
      onCommit(targetId);
    });
  };

  const onWheel = (e: WheelEvent) => {
    const o = optsRef.current;
    if (e.ctrlKey || e.deltaMode !== 0) return; // pinch zoom / line-based wheels
    if ((e.target as Element | null)?.closest?.('.nsb-switcher')) return; // the icon row scrolls itself
    const now = performance.now();
    if (now - s.lastAt > GESTURE_END_MS) {
      s.axis = null;
      s.accX = 0;
      s.accY = 0;
    }
    s.lastAt = now;
    const horizontalish = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    if (s.axis === 'v') return;
    if (s.axis === 'spent') {
      // Momentum of a finished gesture: keep it from navigating the page.
      if (horizontalish) e.preventDefault();
      return;
    }
    if (s.axis === null) {
      if (o.blocked) return;
      s.accX += e.deltaX;
      s.accY += e.deltaY;
      const axis = lockAxis(s.accX, s.accY);
      if (axis === 'v') {
        s.axis = 'v';
        return;
      }
      if (horizontalish) e.preventDefault();
      if (axis === null) return;
      if (s.phase !== 'idle') {
        s.axis = 'spent';
        return;
      }
      // Horizontal lock: the gesture starts here.
      const idx = o.order.findIndex((x) => x.id === o.activeId);
      s.axis = 'h';
      s.phase = 'drag';
      s.index = Math.max(0, idx);
      s.width = o.trackRef.current?.parentElement?.clientWidth ?? 0;
      s.reduced = reducedMotion();
      s.raw = -s.accX;
      s.samples = [];
      s.vHist = [];
      o.onStart();
    } else {
      s.raw -= e.deltaX;
    }
    e.preventDefault();
    s.samples.push({ t: now, x: s.raw });
    s.vHist.push({ t: now, v: estimateVelocity(s.samples, now) });
    if (s.samples.length > 40) s.samples.shift();
    if (s.vHist.length > 40) s.vHist.shift();
    if (!s.reduced && !s.frame) {
      s.frame = requestAnimationFrame(() => {
        s.frame = 0;
        if (s.phase === 'drag') apply(resolveOffset(s.raw, s.index, optsRef.current.order.length, s.width));
      });
    }
    window.clearTimeout(s.endTimer);
    s.endTimer = window.setTimeout(() => {
      s.axis = 'spent';
      finishGesture();
    }, GESTURE_END_MS);
  };

  useEffect(() => {
    const root = opts.rootRef.current;
    if (!root) return;
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      root.removeEventListener('wheel', onWheel);
      stopAnim();
      window.clearTimeout(s.endTimer);
      window.clearTimeout(s.pendingTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The active space changed. Ours (swipe commit): drop the transform in the same
  // commit that re-centres the panes, so nothing visibly moves. Anyone else's
  // (icon click, Ctrl+N): slide from the old space.
  useLayoutEffect(() => {
    const prev = s.prevActive;
    const { activeId, order, trackRef } = optsRef.current;
    s.prevActive = activeId;
    if (prev === activeId) return;
    if (s.phase === 'pending' && s.pendingId === activeId) {
      rest();
      setOutgoing(null);
      return;
    }
    stopAnim();
    window.clearTimeout(s.endTimer);
    window.clearTimeout(s.pendingTimer);
    s.axis = 'spent';
    const iNew = order.findIndex((x) => x.id === activeId);
    const iOld = order.findIndex((x) => x.id === prev);
    const track = trackRef.current;
    if (!track || iNew < 0 || iOld < 0 || reducedMotion()) {
      rest();
      setOutgoing(null);
      return;
    }
    const dir = iNew > iOld ? 1 : -1;
    s.width = track.parentElement?.clientWidth ?? 0;
    s.otherColor = order[iOld].color;
    s.phase = 'anim';
    setOutgoing({ id: prev, side: dir > 0 ? 'prev' : 'next' });
    apply(dir * s.width);
    animate(0, () => {
      rest();
      setOutgoing(null);
    });
  }, [opts.activeId]);

  return outgoing;
}
