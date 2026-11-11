import { describe, expect, it } from 'vitest';
import { resolveShortcut } from '../../src/main/shortcuts';

describe('resolveShortcut (Windows / Linux & macOS)', () => {
  it('resolves tab lifecycle shortcuts', () => {
    expect(resolveShortcut({ key: 'w', control: true }, { platform: 'win32' })).toEqual({ type: 'close-tab' });
    expect(resolveShortcut({ key: 'W', control: true }, { platform: 'win32' })).toEqual({ type: 'close-tab' });
    expect(resolveShortcut({ key: 'F4', control: true }, { platform: 'win32' })).toEqual({ type: 'close-tab' });
    expect(resolveShortcut({ key: 'T', control: true, shift: true }, { platform: 'win32' })).toEqual({ type: 'reopen-closed-tab' });
    expect(resolveShortcut({ key: 't', control: true }, { platform: 'win32' })).toEqual({ type: 'new-tab' });
    expect(resolveShortcut({ key: 'Tab', control: true }, { platform: 'win32' })).toEqual({ type: 'next-tab' });
    expect(resolveShortcut({ key: 'Tab', control: true, shift: true }, { platform: 'win32' })).toEqual({ type: 'prev-tab' });
    expect(resolveShortcut({ key: 'PageDown', control: true }, { platform: 'win32' })).toEqual({ type: 'next-tab' });
    expect(resolveShortcut({ key: 'PageUp', control: true }, { platform: 'win32' })).toEqual({ type: 'prev-tab' });
  });

  it('resolves site navigation & reload shortcuts', () => {
    expect(resolveShortcut({ key: 'ArrowLeft', alt: true }, { platform: 'win32' })).toEqual({ type: 'go-back' });
    expect(resolveShortcut({ key: 'ArrowRight', alt: true }, { platform: 'win32' })).toEqual({ type: 'go-forward' });
    expect(resolveShortcut({ key: 'Home', alt: true }, { platform: 'win32' })).toEqual({ type: 'go-home' });
    expect(resolveShortcut({ key: 'BrowserBack' }, { platform: 'win32' })).toEqual({ type: 'go-back' });
    expect(resolveShortcut({ key: 'BrowserForward' }, { platform: 'win32' })).toEqual({ type: 'go-forward' });
    expect(resolveShortcut({ key: 'BrowserRefresh' }, { platform: 'win32' })).toEqual({ type: 'reload' });
    expect(resolveShortcut({ key: 'BrowserStop' }, { platform: 'win32' })).toEqual({ type: 'stop' });
    expect(resolveShortcut({ key: 'BrowserHome' }, { platform: 'win32' })).toEqual({ type: 'go-home' });

    expect(resolveShortcut({ key: 'r', control: true }, { platform: 'win32' })).toEqual({ type: 'reload' });
    expect(resolveShortcut({ key: 'R', control: true, shift: true }, { platform: 'win32' })).toEqual({ type: 'hard-reload' });
    expect(resolveShortcut({ key: 'F5' }, { platform: 'win32' })).toEqual({ type: 'reload' });
    expect(resolveShortcut({ key: 'F5', control: true }, { platform: 'win32' })).toEqual({ type: 'hard-reload' });
    expect(resolveShortcut({ key: 'F5', shift: true }, { platform: 'win32' })).toEqual({ type: 'hard-reload' });
  });

  it('resolves command bar, find-in-page, panels, spaces and webview-only zoom', () => {
    expect(resolveShortcut({ key: 'l', control: true }, { platform: 'win32' })).toEqual({ type: 'open-command-bar' });
    expect(resolveShortcut({ key: 'k', control: true }, { platform: 'win32' })).toEqual({ type: 'open-command-bar' });
    expect(resolveShortcut({ key: 'F6' }, { platform: 'win32' })).toEqual({ type: 'open-command-bar' });
    expect(resolveShortcut({ key: 'f', control: true }, { platform: 'win32' })).toEqual({ type: 'open-find' });
    expect(resolveShortcut({ key: 'e', control: true }, { platform: 'win32' })).toEqual({ type: 'toggle-tabs' });
    expect(resolveShortcut({ key: 'h', control: true }, { platform: 'win32' })).toEqual({ type: 'open-history' });
    expect(resolveShortcut({ key: ',', control: true }, { platform: 'win32' })).toEqual({ type: 'open-settings' });
    expect(resolveShortcut({ key: '2', control: true }, { platform: 'win32' })).toEqual({ type: 'select-space', index: 1 });
    for (let n = 1; n <= 9; n++) {
      expect(resolveShortcut({ key: String(n), control: true }, { platform: 'win32' })).toEqual({ type: 'select-space', index: n - 1 });
      expect(resolveShortcut({ key: String(n), meta: true }, { platform: 'darwin' })).toEqual({ type: 'select-space', index: n - 1 });
    }
    expect(resolveShortcut({ key: '0', control: true }, { platform: 'win32' })).toBeNull();
    expect(resolveShortcut({ key: 'Escape' }, { platform: 'win32' })).toEqual({ type: 'escape' });

    expect(resolveShortcut({ key: '+', control: true, shift: true }, { platform: 'win32', isWebview: true })).toEqual({ type: 'zoom-in' });
    expect(resolveShortcut({ key: '-', control: true }, { platform: 'win32', isWebview: true })).toEqual({ type: 'zoom-out' });
    expect(resolveShortcut({ key: '0', control: true }, { platform: 'win32', isWebview: true })).toEqual({ type: 'zoom-reset' });
    expect(resolveShortcut({ key: '-', control: true }, { platform: 'win32', isWebview: false })).toBeNull();
  });

  it('supports macOS Meta equivalents and ignores normal editing/page shortcuts', () => {
    expect(resolveShortcut({ key: '[', meta: true }, { platform: 'darwin' })).toEqual({ type: 'go-back' });
    expect(resolveShortcut({ key: ']', meta: true }, { platform: 'darwin' })).toEqual({ type: 'go-forward' });
    expect(resolveShortcut({ key: 'w', meta: true }, { platform: 'darwin' })).toEqual({ type: 'close-tab' });
    expect(resolveShortcut({ key: 'T', meta: true, shift: true }, { platform: 'darwin' })).toEqual({ type: 'reopen-closed-tab' });

    // Must not steal clipboard, word-jump, or keyUp events
    expect(resolveShortcut({ key: 'c', control: true }, { platform: 'win32', isWebview: true })).toBeNull();
    expect(resolveShortcut({ key: 'v', control: true }, { platform: 'win32', isWebview: true })).toBeNull();
    expect(resolveShortcut({ key: 'ArrowLeft', control: true }, { platform: 'win32', isWebview: true })).toBeNull();
    expect(resolveShortcut({ type: 'keyUp', key: 'w', control: true }, { platform: 'win32' })).toBeNull();
  });
});

