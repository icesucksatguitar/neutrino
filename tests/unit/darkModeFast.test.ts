import { describe, it, expect, vi } from 'vitest';
import vm from 'vm';
import {
  DARK_READER_SETTINGS,
  INSTANT_DARK_PREPAINT_CSS,
  buildDarkModeEnableScript,
  buildDarkModeDisableScript,
} from '../../src/main/darkMode';

describe('Fast forced dark mode helpers', () => {
  it('provides instant pre-paint dark CSS that yields once DarkReader attaches', () => {
    expect(INSTANT_DARK_PREPAINT_CSS).toContain('html:not([data-darkreader-mode])');
    expect(INSTANT_DARK_PREPAINT_CSS).toContain('color-scheme: dark');
    expect(INSTANT_DARK_PREPAINT_CSS).toContain('#181a1b');
    expect(INSTANT_DARK_PREPAINT_CSS).toContain('#e8e6e3');
  });

  it('embeds or omits darkReaderCode depending on includeLibrary and executes once cleanly in DOM context', () => {
    const mockLib = `window.DarkReader = {
      setFetchMethod: globalThis.__setFetch,
      enable: globalThis.__enable,
      disable: globalThis.__disable
    };`;

    const fullScript = buildDarkModeEnableScript(mockLib, true);
    expect(fullScript).toContain('typeof window.DarkReader');
    expect(fullScript).toContain('force-cache');
    expect(fullScript).toContain('AbortController');

    const fastReenableScript = buildDarkModeEnableScript(mockLib, false);
    expect(fastReenableScript).not.toContain('typeof window.DarkReader === \'undefined\'');

    const __setFetch = vi.fn();
    const __enable = vi.fn();
    const __disable = vi.fn();
    const doc = {
      documentElement: { style: { colorScheme: '' } },
      body: { style: { colorScheme: '' } },
    };
    const sandbox: any = {
      fetch: vi.fn(),
      document: doc,
      AbortController: globalThis.AbortController,
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      __setFetch,
      __enable,
      __disable,
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;

    const first = vm.runInNewContext(fullScript, sandbox);
    expect(first).toBe('enabled');
    expect(doc.documentElement.style.colorScheme).toBe('dark');
    expect(doc.body.style.colorScheme).toBe('dark');
    expect(__setFetch).toHaveBeenCalledTimes(1);
    expect(__enable).toHaveBeenCalledWith(DARK_READER_SETTINGS);

    // Second invocation on already-darkened document exits immediately without re-running DarkReader
    const second = vm.runInNewContext(fastReenableScript, sandbox);
    expect(second).toBe('already-active');
    expect(__enable).toHaveBeenCalledTimes(1);

    // Disable cleanly restores light colorScheme when requested
    const disableScript = buildDarkModeDisableScript(true);
    const disabled = vm.runInNewContext(disableScript, sandbox);
    expect(disabled).toBe('disabled');
    expect(__disable).toHaveBeenCalledTimes(1);
    expect(sandbox.window.__neutrino_darkreader_active).toBe(false);
    expect(doc.documentElement.style.colorScheme).toBe('light');
    expect(doc.body.style.colorScheme).toBe('light');
  });
});
