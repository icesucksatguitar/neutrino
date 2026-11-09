/**
 * Property 1: Bug Condition - Chrome-shaped identity, YouTube playback breakers and developer artifacts
 *
 * Bug condition exploration tests (bugfix spec google-signin-youtube-playback-fix, task 1).
 * These tests encode the EXPECTED behavior from design.md Properties 1 to 9. On the unfixed
 * code they are expected to FAIL; each failure is a counterexample that proves a bug exists.
 * Do not weaken them to make them pass.
 *
 * Where the unfixed logic lives in Electron-bound or renderer files, the tests run against a
 * verbatim copy in tests/unit/fixtures/original/. Task 3.16 re-points the SUBJECT block below
 * at the fixed modules and re-runs the same tests:
 *   buildUserAgent     -> src/main/userAgent.ts buildUserAgent
 *   rewriteHeaders     -> identity (the onBeforeSendHeaders rewrite is deleted in 3.2)
 *   runAdTick          -> src/main/adblock/youtubeAdController.ts createAdController().tick(player, video)
 *   homescreen/mcp greeting -> src/renderer/utils/greeting.ts formatGreeting(date, getStoredUserName())
 *   permissionHandlers -> src/main/permissions.ts createPermissionHandlers(store, promptFn)
 *   popupOptions       -> the fixed popup options builder in src/main/index.ts
 *   handleFailLoad     -> the fixed handleFailLoad using src/renderer/utils/debug.ts
 * Tests that read source files or import pure modules (engine.ts, mcp/server.ts) need no change.
 *
 * **Validates: Requirements 1.4, 1.5, 1.6, 1.9, 1.10, 1.11, 1.12, 1.13, 1.14, 1.15, 1.18, 1.19, 1.20**
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';

import { BraveShieldEngine } from '../../src/main/adblock/engine';
import { McpServer } from '../../src/main/mcp/server';

import { originalBuildUserAgent, originalRewriteHeaders } from './fixtures/original/userAgent';
import { createOriginalSkipAds } from './fixtures/original/adSkipper';
import { originalHomescreenGreeting, originalMcpGreeting, GreetingStorage } from './fixtures/original/greeting';
import { createOriginalPermissionHandlers, SENSITIVE_PERMISSIONS } from './fixtures/original/permissions';
import { originalPopupWindowOptions } from './fixtures/original/popupOptions';
import { createOriginalHandleFailLoad } from './fixtures/original/failLoad';

// ---------------------------------------------------------------------------
// SUBJECT: the code under test. Re-point these at the fixed modules in task 3.16.
// ---------------------------------------------------------------------------
const SUBJECT = {
  buildUserAgent: originalBuildUserAgent,
  rewriteHeaders: originalRewriteHeaders,
  runAdTick: (fake: FakeYouTube) => createOriginalSkipAds(fake.document)(),
  homescreenGreeting: (date: Date, storage: GreetingStorage, userNameProp: string | undefined) =>
    originalHomescreenGreeting(date, userNameProp, storage),
  mcpGreeting: (date: Date, storage: GreetingStorage) => originalMcpGreeting(date, storage),
  permissionHandlers: createOriginalPermissionHandlers,
  popupOptions: originalPopupWindowOptions,
  handleFailLoad: createOriginalHandleFailLoad,
};

const ROOT = path.resolve(__dirname, '..', '..');
const readSource = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const PKG = JSON.parse(readSource('package.json')) as { version: string };

// ---------------------------------------------------------------------------
// C_ua (1.4 to 1.6): user-agent shape and client hints
// ---------------------------------------------------------------------------
const CHROME_SHAPED = /^Mozilla\/5\.0 \([^)]+\) AppleWebKit\/537\.36 \(KHTML, like Gecko\) Chrome\/[\d.]+ Safari\/537\.36$/;

const PLATFORMS = [
  { platform: 'win32', os: 'Windows NT 10.0; Win64; x64' },
  { platform: 'darwin', os: 'Macintosh; Intel Mac OS X 10_15_7' },
  { platform: 'linux', os: 'X11; Linux x86_64' },
] as const;

const versionPart = fc.integer({ min: 0, max: 999 });
const chromeVersionArb = fc
  .tuple(fc.integer({ min: 100, max: 199 }), fc.constant(0), fc.integer({ min: 1000, max: 9999 }), versionPart)
  .map((p) => p.join('.'));
const appVersionArb = fc.tuple(fc.integer({ min: 0, max: 9 }), versionPart, versionPart).map((p) => p.join('.'));

describe('C_ua: browser identity (1.4, 1.5, 1.6)', () => {
  it('sends a derived, non-Chrome-shaped UA with the real OS, the bundled Chromium version and one Neutrino token', () => {
    fc.assert(
      fc.property(fc.constantFrom(...PLATFORMS), appVersionArb, chromeVersionArb, ({ platform, os }, appVersion, chromeVersion) => {
        // Electron's own default UA for this platform (what app.userAgentFallback holds before any override).
        const defaultUA = `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) neutrino-browser/${appVersion} Chrome/${chromeVersion} Electron/33.4.11 Safari/537.36`;
        const ua = SUBJECT.buildUserAgent(defaultUA, 'Neutrino', appVersion, chromeVersion, platform);

        expect(ua).not.toMatch(CHROME_SHAPED);
        expect(ua).toContain(`Chrome/${chromeVersion}`);
        expect(ua).toContain(`(${os})`);
        const productTokens = ua.match(/Neutrino\/[^\s]+/g) ?? [];
        expect(productTokens).toEqual([`Neutrino/${appVersion}`]);
        expect(ua.indexOf(`Neutrino/${appVersion}`)).toBeLessThan(ua.indexOf('Chrome/'));
        expect(ua).not.toContain('Electron/');
      })
    );
  });

  it('does not add or forge Sec-CH-UA client hints on outgoing requests', () => {
    fc.assert(
      fc.property(fc.constantFrom(...PLATFORMS), chromeVersionArb, ({ os }, chromeVersion) => {
        const ua = `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Neutrino/${PKG.version} Chrome/${chromeVersion} Safari/537.36`;
        // A request that Chromium sent without any client hints (for example a subresource).
        const sent = SUBJECT.rewriteHeaders({ 'User-Agent': ua, Accept: '*/*' });

        const hintKeys = Object.keys(sent).filter((k) => k.toLowerCase().startsWith('sec-ch-ua'));
        expect(hintKeys).toEqual([]);
        expect(JSON.stringify(sent)).not.toContain('Google Chrome');
        expect(sent['User-Agent']).toBe(ua);
      }),
      { numRuns: 20 }
    );
  });
});

// ---------------------------------------------------------------------------
// C_yt 1.9: YouTube ad controller
// ---------------------------------------------------------------------------
interface FakeYouTube {
  document: {
    querySelector(sel: string): any;
    querySelectorAll(sel: string): any[];
  };
  player: { id: string; classList: { contains(c: string): boolean; add(c: string): void; remove(c: string): void } };
  video: { duration: number; currentTime: number; playbackRate: number; muted: boolean; paused: boolean };
  setAd(on: boolean, kind?: 'ad-showing' | 'ad-interrupting'): void;
  currentTimeWrites: number[];
}

function makeFakeYouTube(startRate: number, startMuted: boolean, duration: number, startTime: number): FakeYouTube {
  const classes = new Set<string>(['html5-video-player']);
  const player = {
    id: 'movie_player',
    classList: {
      contains: (c: string) => classes.has(c),
      add: (c: string) => void classes.add(c),
      remove: (c: string) => void classes.delete(c),
    },
  };
  const state = { currentTime: startTime, playbackRate: startRate, muted: startMuted };
  const currentTimeWrites: number[] = [];
  const video = {
    duration,
    paused: false,
    get currentTime() {
      return state.currentTime;
    },
    set currentTime(v: number) {
      currentTimeWrites.push(v);
      state.currentTime = v;
    },
    get playbackRate() {
      return state.playbackRate;
    },
    set playbackRate(v: number) {
      state.playbackRate = v;
    },
    get muted() {
      return state.muted;
    },
    set muted(v: boolean) {
      state.muted = v;
    },
  };
  const empty: any[] = [];
  const document = {
    querySelector(sel: string) {
      if (sel === 'video') return video;
      if (sel === '#movie_player' || sel === '.html5-video-player' || sel === '#movie_player, .html5-video-player') return player;
      const wanted = sel
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.startsWith('.'))
        .map((s) => s.slice(1));
      if (wanted.length > 0 && wanted.some((c) => classes.has(c))) return player;
      return null;
    },
    querySelectorAll(_sel: string) {
      return empty; // no skip buttons or overlays rendered in this model
    },
  };
  return {
    document,
    player,
    video,
    currentTimeWrites,
    setAd(on, kind = 'ad-showing') {
      classes.delete('ad-showing');
      classes.delete('ad-interrupting');
      if (on) classes.add(kind);
    },
  };
}

const segmentArb = fc.record({
  ad: fc.boolean(),
  kind: fc.constantFrom<'ad-showing' | 'ad-interrupting'>('ad-showing', 'ad-interrupting'),
  ticks: fc.integer({ min: 1, max: 4 }),
});

// Every sequence contains at least one ad followed by content.
const tickSequenceArb = fc
  .tuple(
    fc.array(segmentArb, { maxLength: 3 }),
    segmentArb.map((s) => ({ ...s, ad: true })),
    segmentArb.map((s) => ({ ...s, ad: false })),
    fc.array(segmentArb, { maxLength: 3 })
  )
  .map(([pre, ad, content, post]) => [...pre, ad, content, ...post]);

describe('C_yt 1.9: ad controller never alters the real video', () => {
  it('never writes currentTime and restores rate and mute on the first tick after the ad clears', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2),
        fc.boolean(),
        fc.integer({ min: 30, max: 7200 }),
        tickSequenceArb,
        (startRate, startMuted, duration, segments) => {
          const yt = makeFakeYouTube(startRate, startMuted, duration, 3);
          let inAd = false;
          let saved: { rate: number; muted: boolean } | null = null;

          for (const seg of segments) {
            for (let t = 0; t < seg.ticks; t++) {
              if (seg.ad && !inAd) saved = { rate: yt.video.playbackRate, muted: yt.video.muted };
              const leavingAd = inAd && !seg.ad;
              yt.setAd(seg.ad, seg.kind);
              inAd = seg.ad;

              SUBJECT.runAdTick(yt);

              expect(yt.currentTimeWrites).toEqual([]);
              if (leavingAd && saved) {
                expect({ rate: yt.video.playbackRate, muted: yt.video.muted }).toEqual(saved);
                saved = null;
              }
            }
          }
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// C_yt 1.10: playback-critical requests pass shields
// ---------------------------------------------------------------------------
const queryArb = fc
  .dictionary(
    fc.constantFrom('ei', 'cpn', 'docid', 'el', 'ver', 'fmt', 'len', 'rt', 'cmt', 'vis', 'state', 'ns', 'itag', 'mime'),
    fc.stringMatching(/^[A-Za-z0-9_-]{1,12}$/),
    { minKeys: 1, maxKeys: 5 }
  )
  .map((d) =>
    Object.entries(d)
      .map(([k, v]) => `${k}=${v}`)
      .join('&')
  );

const youtubeHostArb = fc.constantFrom('www.youtube.com', 'm.youtube.com', 'youtube.com', 'music.youtube.com');
const youtubePlaybackPathArb = fc.constantFrom(
  '/ptracking',
  '/api/stats/playback',
  '/api/stats/watchtime',
  '/api/stats/delayplay',
  '/api/stats/atr',
  '/api/stats/qoe',
  '/youtubei/v1/player'
);
const youtubeCriticalUrlArb = fc
  .tuple(youtubeHostArb, youtubePlaybackPathArb, queryArb)
  .map(([h, p, q]) => `https://${h}${p}?${q}`);
const googlevideoUrlArb = fc
  .tuple(fc.integer({ min: 1, max: 9 }), fc.stringMatching(/^[a-z0-9]{4,8}$/), queryArb)
  .map(([n, s, q]) => `https://rr${n}---sn-${s}.googlevideo.com/videoplayback?${q}`);

describe('C_yt 1.10: playback-critical YouTube requests are not blocked', () => {
  it('checkUrl returns blocked: false for playback-critical URLs with shields on', () => {
    fc.assert(
      fc.property(fc.oneof(youtubeCriticalUrlArb, googlevideoUrlArb), (url) => {
        const engine = new BraveShieldEngine();
        const decision = engine.checkUrl(url);
        expect({ url, blocked: decision.blocked, rule: decision.rule }).toEqual({ url, blocked: false, rule: undefined });
      })
    );
  });

  it('still blocks the YouTube ad stats endpoint (sanity guard for Property 6)', () => {
    const engine = new BraveShieldEngine();
    expect(engine.checkUrl('https://www.youtube.com/api/stats/ads?ver=2').blocked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// C_yt 1.11 and 1.12: dialog cosmetic rule and forced GPU switches
// ---------------------------------------------------------------------------
describe('C_yt 1.11: cosmetic CSS does not hide YouTube player dialogs', () => {
  it('getCosmeticFilterCSS contains no tp-yt-paper-dialog selector', () => {
    const css = new BraveShieldEngine().getCosmeticFilterCSS();
    expect(css).not.toContain('tp-yt-paper-dialog');
  });
});

describe('C_yt 1.12: startup respects the Chromium GPU blocklist', () => {
  it('src/main/index.ts appends none of the forced GPU switches', () => {
    const src = readSource('src/main/index.ts');
    const switches = Array.from(src.matchAll(/appendSwitch\(\s*['"]([^'"]+)['"]/g)).map((m) => m[1]);
    const forced = ['ignore-gpu-blocklist', 'enable-zero-copy', 'enable-native-gpu-memory-buffers', 'enable-gpu-rasterization'];
    expect(switches.filter((s) => forced.includes(s))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// C_rel 1.13: neutral greeting when no name is stored
// ---------------------------------------------------------------------------
const NEUTRAL_GREETINGS = ['Good morning', 'Good afternoon', 'Good evening'];
const blankNameArb = fc.oneof(fc.constant(''), fc.stringMatching(/^[ \t\n]{1,4}$/));

function storageWith(entries: Record<string, string>): GreetingStorage {
  return { getItem: (k: string) => (k in entries ? entries[k] : null) };
}

const blankStorageArb = blankNameArb.chain((blank) =>
  fc.constantFrom<Record<string, string>>(
    {},
    { neutrino_user_profile: JSON.stringify({ name: blank }) },
    { neutrino_user_name: blank },
    { neutrino_user_name: blank, neutrino_user_profile: JSON.stringify({ name: blank }) }
  )
);

describe('C_rel 1.13: greeting with no stored name', () => {
  it('home screen and MCP drawer show exactly a neutral greeting', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        blankStorageArb,
        fc.option(blankNameArb, { nil: undefined }),
        (hour, minute, entries, userNameProp) => {
          const date = new Date(2025, 0, 15, hour, minute, 0);
          const storage = storageWith(entries);
          expect(NEUTRAL_GREETINGS).toContain(SUBJECT.homescreenGreeting(date, storage, userNameProp));
          expect(NEUTRAL_GREETINGS).toContain(SUBJECT.mcpGreeting(date, storage));
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// C_rel 1.14: MCP server version
// ---------------------------------------------------------------------------
describe('C_rel 1.14: MCP initialize reports the app version', () => {
  it('serverInfo.version equals package.json version', async () => {
    // The fixed constructor takes { version }; the unfixed one ignores the argument.
    const server = new (McpServer as any)({ version: PKG.version }) as McpServer;
    const res: any = await server.handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    expect(res.result.serverInfo.version).toBe(PKG.version);
  });
});

// ---------------------------------------------------------------------------
// C_rel 1.15: assistant model badges
// ---------------------------------------------------------------------------
describe('C_rel 1.15: assistant chips show no model-version badges', () => {
  it('ASSISTANTS in McpModal.tsx has no badge in 3.5, 4o, Flash, R1', () => {
    const src = readSource('src/renderer/components/McpModal.tsx');
    const block = src.match(/const ASSISTANTS[^=]*=\s*\[([\s\S]*?)\n\];/);
    expect(block).not.toBeNull();
    const badges = Array.from(block![1].matchAll(/badge:\s*['"]([^'"]*)['"]/g)).map((m) => m[1]);
    expect(badges.filter((b) => ['3.5', '4o', 'Flash', 'R1'].includes(b))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// C_rel 1.18: sensitive permissions are never granted silently
// ---------------------------------------------------------------------------
const originArb = fc
  .tuple(fc.constantFrom('https', 'http'), fc.stringMatching(/^[a-z][a-z0-9-]{0,10}$/), fc.constantFrom('com', 'org', 'io', 'test'))
  .map(([s, n, tld]) => `${s}://${n}.${tld}`);

describe('C_rel 1.18: sensitive permissions without a remembered decision', () => {
  it('request handler never grants without a prompt and check handler returns false', async () => {
    await fc.assert(
      fc.asyncProperty(originArb, fc.constantFrom(...SENSITIVE_PERMISSIONS), fc.boolean(), async (origin, permission, userAllows) => {
        // In-memory store with no remembered decisions and a stub prompt that records calls.
        const store = { get: () => undefined, set: () => {}, decisions: {} as Record<string, unknown> };
        let prompts = 0;
        const promptFn = async () => {
          prompts++;
          return { allow: userAllows, remember: false };
        };
        const { requestHandler, checkHandler } = SUBJECT.permissionHandlers(store, promptFn) as any;

        const requestingUrl = `${origin}/page`;
        const wc = { id: 1, getURL: () => requestingUrl, isDestroyed: () => false };
        const details = { requestingUrl, mediaTypes: ['video', 'audio'], isMainFrame: true };

        let granted: boolean | undefined;
        await new Promise<void>((resolve) => {
          requestHandler(
            wc,
            permission,
            (g: boolean) => {
              granted = g;
              resolve();
            },
            details
          );
          setTimeout(resolve, 50);
        });

        expect({ permission, origin, grantedWithoutPrompt: granted === true && prompts === 0 }).toEqual({
          permission,
          origin,
          grantedWithoutPrompt: false,
        });
        expect(checkHandler(wc, permission, origin, { requestingUrl, isMainFrame: true })).toBe(false);
      }),
      { numRuns: 50 }
    );
  });
});

// ---------------------------------------------------------------------------
// C_rel 1.19 and 1.20: popup title and production logging
// ---------------------------------------------------------------------------
describe('C_rel 1.19: popups are not titled with a fixed "Sign In"', () => {
  it('popup window options carry no fixed Sign In title', () => {
    fc.assert(
      fc.property(
        fc.oneof(originArb.map((o) => `${o}/share?x=1`), fc.constant('about:blank'), fc.constant('')),
        (url) => {
          const opts: any = SUBJECT.popupOptions(url, undefined);
          expect(opts.title).not.toBe('Sign In');
        }
      ),
      { numRuns: 20 }
    );
  });
});

describe('C_rel 1.20: failed tab loads write nothing to the console in production', () => {
  afterEach(() => vi.restoreAllMocks());

  it('handleFailLoad is silent when not in development', () => {
    const methods = ['log', 'warn', 'error', 'info', 'debug'] as const;
    const spies = methods.map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    fc.assert(
      fc.property(
        fc.integer({ min: -900, max: -1 }).filter((c) => c !== -3),
        originArb,
        fc.constantFrom('ERR_NAME_NOT_RESOLVED', 'ERR_CONNECTION_REFUSED', 'ERR_TIMED_OUT'),
        (errorCode, origin, errorDescription) => {
          spies.forEach((s) => s.mockClear());
          SUBJECT.handleFailLoad(false)({ errorCode, validatedURL: `${origin}/`, errorDescription });
          const writes = spies.reduce((n, s) => n + s.mock.calls.length, 0);
          expect(writes).toBe(0);
        }
      ),
      { numRuns: 20 }
    );
  });
});
