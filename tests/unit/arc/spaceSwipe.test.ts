import { describe, expect, it } from 'vitest';
import {
  AXIS_LOCK_PX,
  decideTarget,
  easeOutCubic,
  estimateVelocity,
  lockAxis,
  resolveOffset,
  rubberBand,
  settleOffset,
} from '../../../src/renderer/utils/spaceSwipe';

describe('lockAxis', () => {
  it('stays undecided for tiny movement', () => {
    expect(lockAxis(2, 1)).toBeNull();
  });
  it('locks horizontal and vertical', () => {
    expect(lockAxis(AXIS_LOCK_PX + 1, 2)).toBe('h');
    expect(lockAxis(2, -(AXIS_LOCK_PX + 1))).toBe('v');
  });
});

describe('rubberBand', () => {
  it('is odd, monotonic and bounded by the width', () => {
    expect(rubberBand(0, 200)).toBe(0);
    expect(rubberBand(-50, 200)).toBe(-rubberBand(50, 200));
    expect(rubberBand(100, 200)).toBeGreaterThan(rubberBand(50, 200));
    expect(rubberBand(200, 200)).toBeLessThan(200);
    expect(rubberBand(200, 200)).toBeLessThan(200 * 0.55);
  });
});

describe('resolveOffset', () => {
  it('is 1:1 inside the range and clamps to one pane', () => {
    expect(resolveOffset(-80, 1, 3, 200)).toBe(-80);
    expect(resolveOffset(500, 1, 3, 200)).toBe(200);
  });
  it('resists at the first and last space', () => {
    expect(resolveOffset(80, 0, 3, 200)).toBeLessThan(80);
    expect(resolveOffset(80, 0, 3, 200)).toBeGreaterThan(0);
    expect(resolveOffset(-80, 2, 3, 200)).toBeGreaterThan(-80);
    expect(resolveOffset(-80, 2, 3, 200)).toBeLessThan(0);
  });
});

describe('decideTarget', () => {
  const base = { width: 200, index: 1, count: 3 };
  it('commits past 30% of the width', () => {
    expect(decideTarget({ ...base, offset: -70, velocity: 0 })).toBe(2);
    expect(decideTarget({ ...base, offset: 70, velocity: 0 })).toBe(0);
  });
  it('springs back below the threshold', () => {
    expect(decideTarget({ ...base, offset: -40, velocity: 0 })).toBe(1);
  });
  it('commits a short flick in the same direction only', () => {
    expect(decideTarget({ ...base, offset: -40, velocity: -1 })).toBe(2);
    expect(decideTarget({ ...base, offset: -40, velocity: 1 })).toBe(1);
    expect(decideTarget({ ...base, offset: -5, velocity: -1 })).toBe(1);
  });
  it('never wraps', () => {
    expect(decideTarget({ ...base, index: 0, offset: 150, velocity: 2 })).toBe(0);
    expect(decideTarget({ ...base, index: 2, offset: -150, velocity: -2 })).toBe(2);
  });
});

describe('estimateVelocity', () => {
  it('uses recent samples only', () => {
    const samples = [
      { t: 0, x: 0 },
      { t: 450, x: -10 },
      { t: 500, x: -60 },
    ];
    expect(estimateVelocity(samples, 500)).toBeCloseTo(-1);
  });
  it('is 0 with fewer than two recent samples', () => {
    expect(estimateVelocity([{ t: 0, x: 0 }], 10)).toBe(0);
    expect(estimateVelocity([], 10)).toBe(0);
  });
});

describe('easing and settle', () => {
  it('easeOutCubic runs 0..1', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
  it('settleOffset points at the target pane', () => {
    expect(settleOffset(1, 1, 200)).toBe(0);
    expect(settleOffset(2, 1, 200)).toBe(-200);
    expect(settleOffset(0, 1, 200)).toBe(200);
  });
});
