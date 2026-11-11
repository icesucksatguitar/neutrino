import { describe, expect, it } from 'vitest';
import { buildPopupWindowOptions, decideWindowOpen } from '../../../src/main/windowOpen';

const mainWindow = { id: 'main' };
const isAuthOrSecurityUrl = (url: string) => url.includes('accounts.google.com');

describe('window-open partition passthrough', () => {
  it('popup uses the opener partition when supplied', () => {
    const d = decideWindowOpen(
      { url: 'https://accounts.google.com/o/oauth2/auth', disposition: 'foreground-tab', features: '' },
      { isAuthOrSecurityUrl, mainWindow, activeTab: { spaceId: 's1' }, partition: 'persist:profile-work' },
    );
    expect(d.action).toBe('allow');
    if (d.action === 'allow') {
      expect(d.overrideBrowserWindowOptions.webPreferences.partition).toBe('persist:profile-work');
      expect(d.overrideBrowserWindowOptions.parent).toBe(mainWindow);
    }
  });

  it('popup falls back to persist:neutrino without a partition', () => {
    const d = decideWindowOpen(
      { url: 'https://example.com/share', disposition: 'new-window', features: 'width=600' },
      { isAuthOrSecurityUrl, mainWindow, activeTab: null },
    );
    expect(d.action).toBe('allow');
    if (d.action === 'allow') expect(d.overrideBrowserWindowOptions.webPreferences.partition).toBe('persist:neutrino');
    expect(buildPopupWindowOptions('https://x.com', null).webPreferences.partition).toBe('persist:neutrino');
    expect(buildPopupWindowOptions('https://x.com', null, 'persist:profile-a').webPreferences.partition).toBe(
      'persist:profile-a',
    );
  });

  it('tab branch keeps the opener space regardless of partition', () => {
    const d = decideWindowOpen(
      { url: 'https://example.com/a', disposition: 'foreground-tab', features: '' },
      { isAuthOrSecurityUrl, mainWindow, activeTab: { spaceId: 'space-x' }, partition: 'persist:profile-x' },
    );
    expect(d).toEqual({ action: 'deny', createTab: { url: 'https://example.com/a', spaceId: 'space-x' } });
  });
});
