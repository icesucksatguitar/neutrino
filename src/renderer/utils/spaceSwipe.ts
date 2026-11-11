// Pure gesture math for the Arc-style swipe between spaces. No DOM, no React.
//
// Sign convention: `offset` is the horizontal translation of the pane track in
// px. Negative moves content left (towards the NEXT space), positive moves it
// right (towards the PREVIOUS space). Wheel `deltaX > 0` is a swipe towards the
// next space, so `offset = -sum(deltaX)`.

/** No wheel events for this long ends the gesture. */
export const GESTURE_END_MS = 120;
/** Duration of the snap / spring-back animation. */
export const SNAP_MS = 250;
/** Fraction of the pane width that commits a swipe. */
export const COMMIT_FRACTION = 0.3;
/** Release velocity (px/ms) that counts as a flick. */
export const FLICK_VELOCITY = 0.6;
/** A flick must have moved at least this far (px) to count. */
export const FLICK_MIN_OFFSET = 24;
/** Accumulated movement (px) needed before the axis is decided. */
export const AXIS_LOCK_PX = 6;
/** Samples older than this (ms) are ignored for the release velocity. */
export const VELOCITY_WINDOW_MS = 100;

export type SwipeAxis = 'h' | 'v';

/** Decides the gesture axis from accumulated deltas; `null` while still too small. */
export function lockAxis(accX: number, accY: number): SwipeAxis | null {
  if (Math.max(Math.abs(accX), Math.abs(accY)) < AXIS_LOCK_PX) return null;
  return Math.abs(accX) > Math.abs(accY) ? 'h' : 'v';
}

/** Diminishing-returns resistance: approaches `width` asymptotically, never reaches it. */
export function rubberBand(distance: number, width: number): number {
  if (width <= 0) return 0;
  const d = Math.abs(distance);
  const out = width * (1 - 1 / ((0.55 * d) / width + 1));
  return distance < 0 ? -out : out;
}

/**
 * Track offset for a raw (1:1) offset: clamped to one pane either way, with
 * rubber-band resistance when pulling past the first or last space.
 */
export function resolveOffset(raw: number, index: number, count: number, width: number): number {
  if (width <= 0) return 0;
  const clamped = Math.max(-width, Math.min(width, raw));
  if (clamped > 0 && index <= 0) return rubberBand(clamped, width);
  if (clamped < 0 && index >= count - 1) return rubberBand(clamped, width);
  return clamped;
}

/** Index the track should settle on after release. Never wraps. */
export function decideTarget(args: {
  offset: number;
  velocity: number;
  width: number;
  index: number;
  count: number;
}): number {
  const { offset, velocity, width, index, count } = args;
  if (offset === 0 || width <= 0) return index;
  const dir = offset < 0 ? 1 : -1;
  const movedFar = Math.abs(offset) >= COMMIT_FRACTION * width;
  const flicked =
    Math.abs(velocity) >= FLICK_VELOCITY &&
    Math.sign(velocity) === Math.sign(offset) &&
    Math.abs(offset) >= FLICK_MIN_OFFSET;
  if (!movedFar && !flicked) return index;
  return Math.max(0, Math.min(count - 1, index + dir));
}

export interface OffsetSample {
  t: number;
  x: number;
}

/** Velocity (px/ms) over the most recent samples; 0 when there is too little data. */
export function estimateVelocity(samples: readonly OffsetSample[], now: number): number {
  const recent = samples.filter((s) => now - s.t <= VELOCITY_WINDOW_MS);
  if (recent.length < 2) return 0;
  const first = recent[0];
  const last = recent[recent.length - 1];
  const dt = last.t - first.t;
  return dt > 0 ? (last.x - first.x) / dt : 0;
}

export function easeOutCubic(p: number): number {
  const c = Math.max(0, Math.min(1, p));
  return 1 - Math.pow(1 - c, 3);
}

/** Final track offset for a settled target: 0 stays, otherwise one pane over. */
export function settleOffset(targetIndex: number, index: number, width: number): number {
  return targetIndex === index ? 0 : targetIndex > index ? -width : width;
}
