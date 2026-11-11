import { describe, expect, it } from 'vitest';
import {
  createTrackpadSwipeTracker,
  SWIPE_COOLDOWN_MS,
  SWIPE_IDLE_RESET_MS,
  SWIPE_TRIGGER_THRESHOLD,
} from '../../src/renderer/utils/trackpadGesture';

describe('createTrackpadSwipeTracker', () => {
  it('accumulates horizontal left-swipe deltas at boundary and triggers back at threshold', () => {
    const tracker = createTrackpadSwipeTracker();

    const s1 = tracker.feedWheel({ deltaX: -50, deltaY: 2, now: 100, atBoundaryX: true, canGoBack: true, canGoForward: false });
    expect(s1.trigger).toBeNull();
    expect(s1.visual).toEqual({ direction: 'back', progress: 50 / SWIPE_TRIGGER_THRESHOLD });

    const s2 = tracker.feedWheel({ deltaX: -60, deltaY: -3, now: 120, atBoundaryX: true, canGoBack: true, canGoForward: false });
    expect(s2.trigger).toBeNull();
    expect(s2.visual?.direction).toBe('back');

    const s3 = tracker.feedWheel({ deltaX: -50, deltaY: 0, now: 140, atBoundaryX: true, canGoBack: true, canGoForward: false });
    expect(s3.trigger).toBe('back');
    expect(s3.visual).toBeNull();
  });

  it('triggers forward on right swipe when canGoForward is true', () => {
    const tracker = createTrackpadSwipeTracker();
    tracker.feedWheel({ deltaX: 80, deltaY: 1, now: 10, atBoundaryX: true, canGoBack: false, canGoForward: true });
    const done = tracker.feedWheel({ deltaX: 80, deltaY: 2, now: 30, atBoundaryX: true, canGoBack: false, canGoForward: true });
    expect(done.trigger).toBe('forward');
  });

  it('enforces cooldown after trigger to ignore inertial wheel tails', () => {
    const tracker = createTrackpadSwipeTracker();
    tracker.feedWheel({ deltaX: -160, deltaY: 0, now: 1000, atBoundaryX: true, canGoBack: true, canGoForward: false });

    // Momentum tail 100ms later must not fire a second navigation
    const inertia = tracker.feedWheel({
      deltaX: -200,
      deltaY: 0,
      now: 1000 + SWIPE_COOLDOWN_MS - 100,
      atBoundaryX: true,
      canGoBack: true,
      canGoForward: false,
    });
    expect(inertia.trigger).toBeNull();
    expect(inertia.visual).toBeNull();

    // After cooldown expires, a fresh swipe works again
    const next = tracker.feedWheel({
      deltaX: -160,
      deltaY: 0,
      now: 1000 + SWIPE_COOLDOWN_MS + 50,
      atBoundaryX: true,
      canGoBack: true,
      canGoForward: false,
    });
    expect(next.trigger).toBe('back');
  });

  it('rejects swipes when horizontal scroll room exists or movement is vertical/diagonal', () => {
    const tracker = createTrackpadSwipeTracker();

    const notAtEdge = tracker.feedWheel({ deltaX: -180, deltaY: 0, now: 100, atBoundaryX: false, canGoBack: true, canGoForward: true });
    expect(notAtEdge.trigger).toBeNull();
    expect(notAtEdge.visual).toBeNull();

    // Reset via idle gap then test diagonal scroll
    const diag = tracker.feedWheel({
      deltaX: -40,
      deltaY: 50,
      now: 100 + SWIPE_IDLE_RESET_MS + 30,
      atBoundaryX: true,
      canGoBack: true,
      canGoForward: true,
    });
    expect(diag.trigger).toBeNull();
    expect(diag.visual).toBeNull();
  });

  it('cancels smoothly if the user reverses swipe direction past zero', () => {
    const tracker = createTrackpadSwipeTracker();
    tracker.feedWheel({ deltaX: -70, deltaY: 0, now: 100, atBoundaryX: true, canGoBack: true, canGoForward: true });
    const reversed = tracker.feedWheel({ deltaX: 90, deltaY: 0, now: 120, atBoundaryX: true, canGoBack: true, canGoForward: true });
    expect(reversed.visual).toBeNull();
    expect(reversed.trigger).toBeNull();

    // Locked out until idle reset
    const followUp = tracker.feedWheel({ deltaX: -180, deltaY: 0, now: 140, atBoundaryX: true, canGoBack: true, canGoForward: true });
    expect(followUp.trigger).toBeNull();

    // Idle reset restores clean tracking
    const fresh = tracker.feedWheel({
      deltaX: -160,
      deltaY: 0,
      now: 140 + SWIPE_IDLE_RESET_MS + 20,
      atBoundaryX: true,
      canGoBack: true,
      canGoForward: true,
    });
    expect(fresh.trigger).toBe('back');
  });
});

