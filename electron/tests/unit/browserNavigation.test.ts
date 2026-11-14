/**
 * Browser identity and tab navigation behaviour that Google (and every other OAuth provider)
 * depends on:
 * - one honest, consistent user-agent (no Chrome impersonation, no forged client hints);
 * - a tab's webview is navigated only for real navigation requests, so redirects are never
 *   interrupted and one-time OAuth callback URLs are never replayed.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';

import { buildUserAgent } from '../../src/main/userAgent';
import {
  createWebviewNavState,
  nextNavigation,
  recordReportedNavigation,
} from '../../src/renderer/utils/webviewNavigation';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('browser identity', () => {
  const electronDefault = (os: string) =>
    `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) neutrino-browser/0.2.0 Chrome/130.0.6723.191 Electron/33.4.11 Safari/537.36`;

  it('keeps the real OS and Chromium version and names Neutrino, without Electron or app-name tokens', () => {
    const ua = buildUserAgent(electronDefault('X11; Linux x86_64'), 'Neutrino', '0.2.0', '130.0.6723.191', 'linux');
    expect(ua).toBe(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Neutrino/0.2.0 Chrome/130.0.6723.191 Safari/537.36'
    );
  });

  it('falls back to the platform OS token when the default UA cannot be parsed', () => {
    expect(buildUserAgent('', 'Neutrino', '1.0.0', '130.0.1.2', 'darwin')).toContain('(Macintosh; Intel Mac OS X 10_15_7)');
    expect(buildUserAgent('garbage', 'Neutrino', '1.0.0', '130.0.1.2', 'win32')).toContain('(Windows NT 10.0; Win64; x64)');
  });

  it('no source file hard-codes a user-agent, forges client hints or hides automation', () => {
    const files = [
      'src/main/index.ts',
      'src/main/browserIdentity.ts',
      'src/renderer/components/BrowserViewport.tsx',
      'src/renderer/components/McpModal.tsx',
    ];
    for (const file of files) {
      const src = read(file);
      expect(src, file).not.toMatch(/Chrome\/130\.0\.0\.0/);
      expect(src, file).not.toMatch(/Google Chrome/);
      expect(src, file).not.toMatch(/['"`]sec-ch-ua/i);
      expect(src, file).not.toMatch(/AutomationControlled/);
      expect(src, file).not.toMatch(/useragent:/);
      expect(src, file).not.toMatch(/onBeforeSendHeaders/);
      // The UA is set in exactly one place: applyBrowserIdentity, once per session.
      if (file !== 'src/main/browserIdentity.ts') expect(src, file).not.toMatch(/setUserAgent\(/);
    }
  });

  it('startup does not wipe the persisted browsing session', () => {
    expect(read('src/main/index.ts')).not.toMatch(/clearStorageData/);
  });
});

/** Simulates the renderer: app state broadcasts tab URLs; the webview reports its own navigations. */
function simulate(initialUrl: string) {
  const state = createWebviewNavState(initialUrl);
  const loads: string[] = [];
  return {
    loads,
    webviewNavigated(url: string) {
      recordReportedNavigation(state, url);
    },
    stateBroadcast(tabUrl: string) {
      const target = nextNavigation(state, tabUrl);
      if (target) loads.push(target);
    },
  };
}

describe('same-tab authentication navigation', () => {
  it('an OAuth redirect chain in a tab is never reloaded or replayed', () => {
    const tab = simulate('https://app.example.com/login');
    const chain = [
      'https://accounts.google.com/o/oauth2/v2/auth?client_id=1&state=s',
      'https://accounts.google.com/v3/signin/identifier?TL=a',
      'https://accounts.google.com/v3/signin/challenge/pwd?TL=a',
      'https://app.example.com/api/auth/callback/google?code=ONCE&state=s',
      'https://app.example.com/dashboard',
    ];
    // Each navigation is echoed back through app state, sometimes late and with stale values.
    tab.stateBroadcast('https://app.example.com/login');
    tab.webviewNavigated(chain[0]);
    tab.webviewNavigated(chain[1]);
    tab.stateBroadcast(chain[0]); // late echo while the webview is already at chain[1]
    tab.stateBroadcast(chain[1]);
    tab.webviewNavigated(chain[2]);
    tab.webviewNavigated(chain[3]);
    tab.webviewNavigated(chain[4]);
    tab.stateBroadcast(chain[2]);
    tab.stateBroadcast(chain[2]); // duplicate broadcast (e.g. a title update)
    tab.stateBroadcast(chain[4]); // coalesced: chain[3] echo never arrives on its own
    expect(tab.loads).toEqual([]);
  });

  it('user and app navigations (omnibox, MCP, back to a visited URL) still load', () => {
    const tab = simulate('https://example.com/');
    tab.webviewNavigated('https://example.com/a');
    tab.stateBroadcast('https://example.com/a');
    tab.stateBroadcast('https://news.example.org/');
    expect(tab.loads).toEqual(['https://news.example.org/']);

    tab.webviewNavigated('https://news.example.org/');
    tab.stateBroadcast('https://news.example.org/');
    // Typing a URL the tab visited earlier is a real request, not an echo.
    tab.stateBroadcast('https://example.com/a');
    expect(tab.loads).toEqual(['https://news.example.org/', 'https://example.com/a']);
  });

  it('property: echoes of any navigation sequence, in order, never trigger a load', () => {
    const urlArb = fc.webUrl({ withQueryParameters: true });
    fc.assert(
      fc.property(urlArb, fc.array(urlArb, { minLength: 1, maxLength: 12 }), fc.array(fc.boolean(), { maxLength: 12 }), (start, navs, skips) => {
        const tab = simulate(start);
        for (const url of navs) tab.webviewNavigated(url);
        // Broadcasts arrive in order but may skip intermediate values.
        navs.forEach((url, i) => {
          if (!skips[i] || i === navs.length - 1) tab.stateBroadcast(url);
        });
        expect(tab.loads).toEqual([]);
      }),
      { numRuns: 300 }
    );
  });
});
