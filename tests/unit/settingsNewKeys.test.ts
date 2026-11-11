import { describe, it, expect } from 'vitest';
import { normalizeSettings } from '../../src/main/settings';

describe('arc redesign settings keys', () => {
  it('fills defaults for an empty object', () => {
    const out = normalizeSettings({});
    expect(out.archiveIntervalHours).toBe(12);
    expect(out.rightPinsDockVisible).toBe(true);
    expect(out.sidebarExpanded).toBe(true);
    expect(out.sidebarAutoHide).toBe(false);
  });

  it('keeps supported intervals and rejects unsupported ones', () => {
    expect(normalizeSettings({ archiveIntervalHours: 'never' }).archiveIntervalHours).toBe('never');
    expect(normalizeSettings({ archiveIntervalHours: 720 }).archiveIntervalHours).toBe(720);
    expect(normalizeSettings({ archiveIntervalHours: 48 }).archiveIntervalHours).toBe(12);
    expect(normalizeSettings({ archiveIntervalHours: '24' }).archiveIntervalHours).toBe(12);
  });

  it('replaces non-boolean flags with defaults', () => {
    const out = normalizeSettings({ rightPinsDockVisible: 'no', sidebarExpanded: 0, sidebarAutoHide: null });
    expect(out.rightPinsDockVisible).toBe(true);
    expect(out.sidebarExpanded).toBe(true);
    expect(out.sidebarAutoHide).toBe(false);
  });

  it('keeps existing settings and unknown keys alongside the new keys, idempotently', () => {
    const out = normalizeSettings({
      adblockEnabled: false,
      searchEngine: 'bing',
      theme: 'light',
      sidebarAutoHide: true,
      rightPinsDockVisible: false,
    });
    expect(out.adblockEnabled).toBe(false);
    expect(out.searchEngine).toBe('bing');
    expect(out.theme).toBe('light');
    expect(out.sidebarAutoHide).toBe(true);
    expect(out.rightPinsDockVisible).toBe(false);
    expect(normalizeSettings(out)).toEqual(out);
  });
});
