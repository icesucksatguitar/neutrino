import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  SessionConfigurator,
  REQUEST_FILTER,
  type ConfigurableSession,
  type SessionConfiguratorDeps,
  type TrackerBlockedPayload,
} from '../../../src/main/sessions/configurator';
import { BraveShieldEngine } from '../../../src/main/adblock/engine';
import { isAuthOrSecurityUrl } from '../../../src/main/urlClassifier';

/** Copy of isMediaStreamingUrl from src/main/index.ts (index.ts cannot be imported in tests). */
function isMediaStreamingUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    lower.includes('googlevideo.com') ||
    lower.includes('videoplayback') ||
    lower.includes('youtubei/v1/player') ||
    lower.includes('youtube.com/api/stats/playback') ||
    lower.includes('youtube.com/api/stats/watchtime') ||
    lower.includes('youtube.com/api/stats/delayplay') ||
    lower.includes('youtube.com/api/stats/atr') ||
    lower.includes('youtube.com/api/stats/qoe') ||
    lower.includes('youtube.com/ptracking')
  );
}

type BeforeRequestListener = (details: { url: string }, callback: (r: { cancel: boolean }) => void) => void;

/** Records every call `configure` makes, standing in for an Electron Session. */
function createFakeSession() {
  const calls = {
    userAgent: [] as string[],
    filters: [] as unknown[],
    listeners: [] as BeforeRequestListener[],
    checkHandlers: [] as Array<(...args: any[]) => boolean>,
    requestHandlers: [] as Array<(...args: any[]) => void>,
  };
  const sess = {
    setUserAgent: (ua: string) => {
      calls.userAgent.push(ua);
    },
    webRequest: {
      onBeforeRequest: (filter: unknown, listener: BeforeRequestListener) => {
        calls.filters.push(filter);
        calls.listeners.push(listener);
      },
    },
    setPermissionCheckHandler: (h: any) => {
      calls.checkHandlers.push(h);
    },
    setPermissionRequestHandler: (h: any) => {
      calls.requestHandlers.push(h);
    },
  };
  /** Runs the registered onBeforeRequest listener synchronously and returns its callback value. */
  const request = (url: string): { cancel: boolean } => {
    let result: { cancel: boolean } | undefined;
    calls.listeners[0]({ url }, (r) => {
      result = r;
    });
    if (!result) throw new Error('listener did not call back');
    return result;
  };
  return { sess: sess as unknown as ConfigurableSession, calls, request };
}

function setup(overrides: Partial<SessionConfiguratorDeps> = {}) {
  const engine = new BraveShieldEngine();
  const reported: TrackerBlockedPayload[] = [];
  let killSwitch = false;
  const configurator = new SessionConfigurator({
    adblockEngine: engine,
    applyIdentity: (s) => s.setUserAgent('Neutrino-UA'),
    shouldBlockForKillSwitch: () => killSwitch,
    isMediaStreamingUrl,
    reportBlocked: (p) => reported.push(p),
    ...overrides,
  });
  return {
    engine,
    reported,
    configurator,
    setKillSwitch: (v: boolean) => {
      killSwitch = v;
    },
  };
}

describe('SessionConfigurator.configure', () => {
  it('applies identity, request interception and permission handlers to a session', () => {
    const { configurator } = setup();
    const { sess, calls } = createFakeSession();
    configurator.configure(sess);
    expect(calls.userAgent).toEqual(['Neutrino-UA']);
    expect(calls.filters).toEqual([REQUEST_FILTER]);
    expect(REQUEST_FILTER).toEqual({ urls: ['*://*/*'] });
    expect(calls.checkHandlers).toHaveLength(1);
    expect(calls.requestHandlers).toHaveLength(1);
    expect(configurator.isConfigured(sess)).toBe(true);
  });

  it('configures each session once and every session independently', () => {
    const { configurator } = setup();
    const a = createFakeSession();
    const b = createFakeSession();
    configurator.configure(a.sess);
    configurator.configure(a.sess);
    configurator.configure(b.sess);
    expect(a.calls.listeners).toHaveLength(1);
    expect(a.calls.userAgent).toHaveLength(1);
    expect(b.calls.listeners).toHaveLength(1);
    expect(b.calls.checkHandlers).toHaveLength(1);
  });

  it('allows every permission check and grants every request by default, as today', () => {
    const { configurator } = setup();
    const { sess, calls } = createFakeSession();
    configurator.configure(sess);
    expect(calls.checkHandlers[0](null, 'media', 'https://a.com', {})).toBe(true);
    const granted: boolean[] = [];
    calls.requestHandlers[0](null, 'geolocation', (ok: boolean) => granted.push(ok), {});
    expect(granted).toEqual([true]);
  });

  it('uses injected permission handlers', () => {
    const check = () => false;
    const request = (_w: unknown, _p: unknown, cb: (ok: boolean) => void) => cb(false);
    const { configurator } = setup({ permissionCheckHandler: check, permissionRequestHandler: request as any });
    const { sess, calls } = createFakeSession();
    configurator.configure(sess);
    expect(calls.checkHandlers[0]).toBe(check);
    expect(calls.requestHandlers[0]).toBe(request);
  });
});

describe('SessionConfigurator request handler', () => {
  it('cancels a known tracker and reports neutrino:tracker-blocked payload', () => {
    const { configurator, reported, engine } = setup();
    const { sess, request } = createFakeSession();
    configurator.configure(sess);
    const url = 'https://www.google-analytics.com/collect?v=1';
    expect(request(url)).toEqual({ cancel: true });
    expect(reported).toEqual([
      { url, domain: 'www.google-analytics.com', category: 'Analytics', rule: 'Blocklist: google-analytics.com' },
    ]);
    expect(engine.getStats().totalBlocked).toBe(1);
  });

  it('lets internal schemes, auth endpoints, media streams and benign URLs through without reporting', () => {
    const { configurator, reported, engine } = setup();
    const { sess, request } = createFakeSession();
    configurator.configure(sess);
    for (const url of [
      'devtools://devtools/bundled/inspector.html',
      'chrome-extension://abc/doubleclick.net',
      'https://accounts.google.com/signin',
      'https://rr1.googlevideo.com/videoplayback?id=1',
      'https://example.com/',
    ]) {
      expect(request(url)).toEqual({ cancel: false });
    }
    expect(reported).toEqual([]);
    expect(engine.getStats().totalBlocked).toBe(0);
  });

  it('kill switch cancels before any allow rule and without reporting', () => {
    const { configurator, reported, setKillSwitch } = setup();
    const { sess, request } = createFakeSession();
    configurator.configure(sess);
    setKillSwitch(true);
    expect(request('https://accounts.google.com/signin')).toEqual({ cancel: true });
    expect(request('https://doubleclick.net/ad')).toEqual({ cancel: true });
    expect(request('file:///C:/x.html')).toEqual({ cancel: false });
    expect(reported).toEqual([]);
  });

  it('blocks nothing when shields are off', () => {
    const { configurator, reported, engine } = setup();
    engine.setEnabled(false);
    const { sess, request } = createFakeSession();
    configurator.configure(sess);
    expect(request('https://doubleclick.net/ad')).toEqual({ cancel: false });
    expect(reported).toEqual([]);
  });

  it('forwards webContents to the auth handoff', () => {
    const attached: unknown[] = [];
    const { configurator } = setup({ authHandoff: { attach: (c) => attached.push(c) } });
    const contents = { id: 7 } as any;
    configurator.attachWebContents(contents);
    expect(attached).toEqual([contents]);
  });
});

const urlArb = fc.oneof(
  fc.constantFrom(
    'doubleclick.net',
    'www.google-analytics.com',
    'connect.facebook.net',
    'coinhive.com',
    'example.com',
    'accounts.google.com',
    'www.youtube.com',
    'rr3.googlevideo.com',
    'news.ycombinator.com',
  ).chain((host) =>
    fc
      .constantFrom('/', '/pagead/x', '/collect', '/videoplayback', '/youtubei/v1/player', '/signin', '/ads?client=1')
      .map((p) => `https://${host}${p}`),
  ),
  fc.webUrl(),
);

describe('SessionConfigurator property: every configured session behaves identically', () => {
  /** **Validates: Requirements 2.1, 21.3, 21.14** */
  it('two sessions configured by the same configurator give the same decisions, and a report exactly for each engine block', () => {
    fc.assert(
      fc.property(fc.array(urlArb, { maxLength: 25 }), fc.boolean(), (urls, killSwitch) => {
        const { configurator, reported, engine, setKillSwitch } = setup();
        setKillSwitch(killSwitch);
        const reference = new BraveShieldEngine();
        const a = createFakeSession();
        const b = createFakeSession();
        configurator.configure(a.sess);
        configurator.configure(b.sess);
        let expectedReports = 0;
        for (const url of urls) {
          const before = reported.length;
          const ra = a.request(url);
          const reportedByA = reported.length - before;
          const rb = b.request(url);
          expect(rb).toEqual(ra);
          expect(reported.length - before).toBe(reportedByA * 2);
          if (!killSwitch && !isAuthOrSecurityUrl(url) && !isMediaStreamingUrl(url)) {
            const d1 = reference.checkUrl(url);
            reference.checkUrl(url);
            expect(ra.cancel).toBe(d1.blocked);
            if (d1.blocked) {
              expectedReports += 2;
              expect(reported[reported.length - 1]).toEqual({ url, domain: d1.domain, category: d1.category, rule: d1.rule });
            }
          }
        }
        expect(reported.length).toBe(expectedReports);
        expect(engine.getStats()).toEqual(reference.getStats());
      }),
      { numRuns: 100 },
    );
  });
});
