export type SwipeDirection = 'back' | 'forward';

export interface SwipeWheelSample {
  deltaX: number;
  deltaY: number;
  now: number;
  atBoundaryX: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface SwipeProgressState {
  direction: SwipeDirection;
  progress: number; // 0..1
}

export interface SwipeFeedResult {
  visual: SwipeProgressState | null;
  trigger: SwipeDirection | null;
}

export const SWIPE_TRIGGER_THRESHOLD = 150;
export const SWIPE_IDLE_RESET_MS = 220;
export const SWIPE_COOLDOWN_MS = 700;

/**
 * Stateful horizontal two-finger trackpad gesture accumulator.
 * Prevents diagonal scroll noise, mid-container scrolling, direction reversals,
 * and inertial momentum tails from triggering unintended history navigation.
 */
export function createTrackpadSwipeTracker() {
  let engaged: SwipeDirection | null = null;
  let accX = 0;
  let accY = 0;
  let lastEventAt = 0;
  let cooldownUntil = 0;
  let lockedOut = false;

  const reset = () => {
    engaged = null;
    accX = 0;
    accY = 0;
    lockedOut = false;
  };

  const feedWheel = (sample: SwipeWheelSample): SwipeFeedResult => {
    const { deltaX, deltaY, now, atBoundaryX, canGoBack, canGoForward } = sample;

    if (now < cooldownUntil) {
      reset();
      return { visual: null, trigger: null };
    }

    if (lastEventAt > 0 && now - lastEventAt > SWIPE_IDLE_RESET_MS) {
      reset();
    }
    lastEventAt = now;

    if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) {
      return {
        visual: engaged
          ? {
              direction: engaged,
              progress: Math.min(1, (engaged === 'back' ? Math.max(0, -accX) : Math.max(0, accX)) / SWIPE_TRIGGER_THRESHOLD),
            }
          : null,
        trigger: null,
      };
    }

    if (lockedOut) {
      return { visual: null, trigger: null };
    }

    if (engaged === null) {
      // Gesture must start strictly horizontal and already at the horizontal scroll edge
      if (!atBoundaryX || Math.abs(deltaX) < 2 || Math.abs(deltaY) * 1.15 >= Math.abs(deltaX)) {
        lockedOut = true;
        return { visual: null, trigger: null };
      }

      const dir: SwipeDirection = deltaX < 0 ? 'back' : 'forward';
      const available = dir === 'back' ? canGoBack : canGoForward;
      if (!available) {
        lockedOut = true;
        return { visual: null, trigger: null };
      }
      engaged = dir;
    }

    accX += deltaX;
    accY += deltaY;

    // Abort if vertical movement grows comparable to horizontal
    if (Math.abs(accY) > Math.abs(accX) * 0.75) {
      reset();
      lockedOut = true;
      return { visual: null, trigger: null };
    }

    // Cancel smoothly if the user reverses their horizontal swipe back toward zero
    if ((engaged === 'back' && accX > 10) || (engaged === 'forward' && accX < -10)) {
      reset();
      lockedOut = true;
      return { visual: null, trigger: null };
    }

    const distance = engaged === 'back' ? Math.max(0, -accX) : Math.max(0, accX);
    const progress = Math.min(1, distance / SWIPE_TRIGGER_THRESHOLD);

    if (distance >= SWIPE_TRIGGER_THRESHOLD) {
      const fired = engaged;
      reset();
      cooldownUntil = now + SWIPE_COOLDOWN_MS;
      return { visual: null, trigger: fired };
    }

    if (progress < 0.12) {
      return { visual: null, trigger: null };
    }

    return {
      visual: { direction: engaged, progress },
      trigger: null,
    };
  };

  return { feedWheel, reset };
}

/**
 * Checks whether an element or any ancestor container still has room to scroll horizontally
 * in the deltaX direction (`deltaX < 0` means scrolling toward left edge; `deltaX > 0` toward right edge).
 */
export function hasHorizontalScrollRoom(startElement: EventTarget | null, deltaX: number): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  let el = startElement instanceof Element ? startElement : null;
  while (el) {
    if (el instanceof HTMLElement) {
      const style = window.getComputedStyle(el);
      const overflowX = style.overflowX;
      const scrollable =
        (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay') &&
        el.scrollWidth > el.clientWidth + 2;
      if (scrollable) {
        if (deltaX < 0 && el.scrollLeft > 2) return true;
        if (deltaX > 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 2) return true;
      }
    }
    el = el.parentElement;
  }

  const root = document.scrollingElement || document.documentElement;
  if (root && root.scrollWidth > window.innerWidth + 2) {
    if (deltaX < 0 && root.scrollLeft > 2) return true;
    if (deltaX > 0 && root.scrollLeft + window.innerWidth < root.scrollWidth - 2) return true;
  }
  return false;
}

