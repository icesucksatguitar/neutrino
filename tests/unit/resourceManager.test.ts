// Feature: browser-settings-panel — ZenResourceManager auto-sleep switch (Requirements 5.8, 5.9).
// Fake timers drive both the 60 s monitor interval and Date.now(), so the manager is created after
// vi.useFakeTimers() to pick up the faked setInterval.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZenResourceManager } from '../../src/main/resourceManager';

const PAST_THRESHOLD_MS = 11 * 60 * 1000; // threshold is 10 minutes; monitor ticks every minute

describe('ZenResourceManager auto-sleep', () => {
  let manager: ZenResourceManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new ZenResourceManager();
    manager.registerTab('tab-1');
  });

  afterEach(() => {
    manager.destroy();
    vi.useRealTimers();
  });

  it('leaves an idle tab awake past 10 minutes while auto-sleep is off', () => {
    const onSleep = vi.fn();
    manager.setOnSleepCallback(onSleep);
    manager.setAutoSleepEnabled(false);

    vi.advanceTimersByTime(PAST_THRESHOLD_MS);

    expect(manager.isTabSleeping('tab-1')).toBe(false);
    expect(onSleep).not.toHaveBeenCalled();
  });

  it('still sleeps and wakes a tab on manual request while auto-sleep is off', () => {
    manager.setAutoSleepEnabled(false);

    manager.sleepTab('tab-1');
    expect(manager.isTabSleeping('tab-1')).toBe(true);

    manager.wakeTab('tab-1');
    expect(manager.isTabSleeping('tab-1')).toBe(false);
  });

  it('sleeps an idle tab past 10 minutes while auto-sleep is on', () => {
    const onSleep = vi.fn();
    manager.setOnSleepCallback(onSleep);
    manager.setAutoSleepEnabled(true);

    vi.advanceTimersByTime(PAST_THRESHOLD_MS);

    expect(manager.isTabSleeping('tab-1')).toBe(true);
    expect(onSleep).toHaveBeenCalledWith('tab-1');
  });

  it('resumes inactivity sleeping after auto-sleep is turned back on', () => {
    manager.setAutoSleepEnabled(false);
    vi.advanceTimersByTime(PAST_THRESHOLD_MS);
    expect(manager.isTabSleeping('tab-1')).toBe(false);

    manager.setAutoSleepEnabled(true);
    vi.advanceTimersByTime(60 * 1000);
    expect(manager.isTabSleeping('tab-1')).toBe(true);
  });
});
