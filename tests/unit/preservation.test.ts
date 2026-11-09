/**
 * Preservation property tests (task 2, design Properties 10 to 13).
 *
 * Every property compares the ORIGINAL logic (tests/unit/fixtures/original/, copied before any
 * fix) with the LIVE logic (tests/unit/liveModules.ts, which task 3 repoints at the new pure
 * modules), restricted to inputs where isBugCondition is false. These tests must pass on the
 * unfixed code and keep passing after the fix.
 */
import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  BraveShieldEngine as OriginalShieldEngine,
  KNOWN_TRACKERS,
  originalDomReadyAdInjection,
  originalRequestDecision,
} from './fixtures/original/shieldEngine';
import { isAuthOrSecurityUrl as originalIsAuthOrSecurityUrl } from './fixtures/original/authUrl';
import { originalWindowOpenDecision } from './fixtures/original/windowOpen';
import {
  DARK_READER_SETTINGS,
  PDF_DARK_FILTER,
  originalIsDarkReaderEligible,
} from './fixtures/original/darkReaderEligibility';
import {
  originalFormatGreeting,
  originalHomescreenGreeting,
  originalMcpGreeting,
} from './fixtures/original/greeting';
import { SAFE_PERMISSIONS } from './fixtures/original/permissions';
import {
  createLivePermissionHandlers,
  createLiveShieldEngine,
  liveDarkReaderSettings,
  liveDomReadyAdInjection,
  liveFormatGreeting,
  liveIsAuthOrSecurityUrl,
  liveRequestDecision,
  liveShouldInjectDarkReader,
  liveStoredUserName,
  liveWindowOpenDecision,
} from './liveModules';

import { McpServer } from '../../src/main/mcp/server';
import { BrowserManager } from '../../src/main/browserManager';
import { ZenResourceManager } from '../../src/main/resourceManager';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const NUM_RUNS = 300;

// ---------------------------------------------------------------------------
// Input-domain helpers (where isBugCondition is false)
// ---------------------------------------------------------------------------

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith('.' + domain);
}

/**
 * Playback-critical requests from the design glossary. These are the inputs the fix is allowed
 * to change (C_yt / 1.10), so they are excluded from shield preservation.
 */
function isPlaybackCriticalForTest(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase();
  if (hostMatches(host, 'googlevideo.com')) return true;
  if (!hostMatches(host, 'youtube.com')) return false;
  const p = u.pathname.toLowerCase();
  if (p.startsWith('/youtubei/v1/player') && !url.toLowerCase().includes('ad_break')) return true;
  if (p.startsWith('/ptracking')) return true;
  if (/^\/api\/stats\/(playback|watchtime|delayplay|atr|qoe)/.test(p) && !u.searchParams.has('adformat')) return true;
  return false;
}

/**
 * Shield preservation domain. The fix also drops the '/ptracking' substring from the pattern
 * list (task 3.5), so any URL carrying it is outside the preserved domain.
 */
function inShieldPreservationDomain(url: string): boolean {
  return !isPlaybackCriticalForTest(url) && !url.toLowerCase().includes('/ptracking');
}

/** NATIVE_DARK_HOSTS from the design. These are where the fix intentionally changes the DarkReader decision. */
const NATIVE_DARK_HOSTS = [
  'youtube.com',
  'github.com',
  'x.com',
  'twitter.com',
  'reddit.com',
  'discord.com',
  'chatgpt.com',
  'claude.ai',
  'gemini.google.com',
  'perplexity.ai',
  'chat.deepseek.com',
  'wikipedia.org',
  'stackoverflow.com',
];

function isNativeDarkForTest(url: string): boolean {
  const host = hostOf(url);
  return host !== '' && NATIVE_DARK_HOSTS.some((d) => hostMatches(host, d));
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const label = fc.stringMatching(/^[a-z0-9]([a-z0-9-]{0,8}[a-z0-9])?$/);
const pathSeg = fc.stringMatching(/^[A-Za-z0-9_.~-]{1,12}$/);
const pathArb = fc.array(pathSeg, { maxLength: 4 }).map((segs) => (segs.length ? '/' + segs.join('/') : '/'));
const queryArb = fc
  .array(fc.tuple(fc.stringMatching(/^[a-z_]{1,8}$/), fc.stringMatching(/^[A-Za-z0-9_-]{0,10}$/)), { maxLength: 3 })
  .map((pairs) => (pairs.length ? '?' + pairs.map(([k, v]) => `${k}=${v}`).join('&') : ''));
const schemeArb = fc.constantFrom('https', 'http');

const BENIGN_HOSTS = [
  'example.com',
  'www.example.org',
  'news.ycombinator.com',
  'developer.mozilla.org',
  'www.bbc.co.uk',
  'docs.python.org',
  'www.nytimes.com',
  'www.youtube.com',
  'm.youtube.com',
  'www.google.com',
  'i.ytimg.com',
];

const benignHostArb = fc.oneof(
  fc.constantFrom(...BENIGN_HOSTS),
  fc.tuple(label, fc.constantFrom('com', 'org', 'net', 'io', 'test')).map(([l, tld]) => `${l}.${tld}`),
);

const trackerUrlArb = fc
  .tuple(schemeArb, fc.array(label, { maxLength: 3 }), fc.constantFrom(...KNOWN_TRACKERS), pathArb, queryArb)
  .map(([scheme, subs, domain, p, q]) => `${scheme}://${[...subs, domain].join('.')}${p}${q}`);

/** URLs matching the original pattern stage (minus '/ptracking', which the fix removes). */
const adPatternUrlArb = fc
  .tuple(benignHostArb, pathSeg, label, queryArb)
  .chain(([host, seg, l, q]) =>
    fc.constantFrom(
      `https://${host}/${seg}/pagead/${l}${q}`,
      `https://www.youtube.com/api/stats/ads?ver=2&${l}=1`,
      `https://www.youtube.com/api/stats/ads${q}`,
      `https://www.youtube.com/pagead/viewthroughconversion/${l}${q}`,
      `https://www.youtube.com/get_midroll_info?ei=${l}`,
      `https://www.youtube.com/youtubei/v1/player/ad_break?key=${l}`,
      `https://www.youtube.com/api/stats/qoe?adformat=15_2_1&cpn=${l}`,
      `https://googleads.g.doubleclick.net/pagead/id${q}`,
      `https://securepubads.g.doubleclick.net/gpt/${l}.js`,
      `https://pagead2.googlesyndication.com/${seg}`,
      `https://${host}/${seg}/ads/vpaid/${l}`,
      `https://${host}/ads?client=ca-pub-${l}`,
      `https://${host}/${seg}?ref=adnxs.com`,
      `https://${host}/${seg}?partner=rubiconproject.com`,
      `https://${host}/${seg}?via=doubleclick.net`,
      `https://${host}/${seg}?s=adservice.google.com`,
      `https://${host}/${seg}?w=taboola.com&${l}`,
      `https://${host}/${seg}?w=outbrain.com`,
      `https://${host}/${seg}?w=criteo.com`,
      `https://${host}/${seg}?w=scorecardresearch.com`,
    ),
  );

const benignUrlArb = fc.oneof(
  fc.tuple(schemeArb, benignHostArb, pathArb, queryArb).map(([s, h, p, q]) => `${s}://${h}${p}${q}`),
  fc.constantFrom(
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/results?search_query=lofi',
    'https://www.youtube.com/s/player/abc/player_ias.vflset/en_US/base.js',
    'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
  ),
  fc.webUrl({ withQueryParameters: true, withFragments: true }),
  fc.string({ maxLength: 40 }),
);

const shieldUrlArb = fc.oneof(trackerUrlArb, adPatternUrlArb, benignUrlArb).filter(inShieldPreservationDomain);

const randomCase = (s: string) =>
  fc.array(fc.boolean(), { minLength: s.length, maxLength: s.length }).map((flags) =>
    s
      .split('')
      .map((ch, i) => (flags[i] ? ch.toUpperCase() : ch))
      .join(''),
  );

const identityProviderUrlArb = fc.tuple(label, queryArb).chain(([l, q]) =>
  fc.constantFrom(
    // GitHub
    `https://github.com/login/oauth/authorize?client_id=${l}`,
    `https://github.com/login${q}`,
    `https://api.github.com/user${q}`,
    // Microsoft
    `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${l}`,
    `https://login.live.com/oauth20_authorize.srf${q}`,
    `https://aadcdn.msftauth.net/shared/1.0/content/js/${l}.js`,
    // Apple
    `https://appleid.apple.com/auth/authorize?client_id=${l}`,
    // Auth0
    `https://${l}.auth0.com/authorize${q}`,
    `https://${l}.us.auth0.com/u/login${q}`,
    // Clerk
    `https://clerk.${l}.com/v1/client${q}`,
    `https://accounts.${l}.clerk.accounts.dev/sign-in`,
    // Supabase
    `https://${l}.supabase.co/auth/v1/authorize?provider=github`,
    // Google (host-anchored, valid both before and after hostname-based matching)
    `https://accounts.google.com/v3/signin/identifier?flowName=${l}`,
    `https://oauth2.googleapis.com/token`,
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${l}`,
    `https://securetoken.googleapis.com/v1/token?key=${l}`,
  ),
);

const captchaUrlArb = fc.tuple(label, queryArb).chain(([l, q]) =>
  fc.constantFrom(
    `https://www.google.com/recaptcha/api2/anchor?k=${l}`,
    `https://www.recaptcha.net/recaptcha/api.js${q}`,
    `https://www.gstatic.com/recaptcha/releases/${l}/recaptcha__en.js`,
    `https://hcaptcha.com/1/api.js${q}`,
    `https://newassets.hcaptcha.com/captcha/v1/${l}/static/hcaptcha.html`,
    `https://challenges.cloudflare.com/turnstile/v0/api.js${q}`,
    `https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/${l}`,
  ),
);

const AUTH_KEYWORDS = ['/oauth', '/auth', '/login', '/signin', '/signup', '/otp', '/token'];
const keywordPathUrlArb = fc
  .tuple(benignHostArb, fc.array(pathSeg, { maxLength: 2 }), fc.constantFrom(...AUTH_KEYWORDS), pathSeg, queryArb)
  .chain(([host, pre, kw, suffix, q]) =>
    randomCase(kw).map((k) => `https://${host}${pre.map((s) => '/' + s).join('')}${k}${suffix}${q}`),
  );

const authDomainUrlArb = fc.oneof(
  identityProviderUrlArb,
  captchaUrlArb,
  keywordPathUrlArb,
  benignUrlArb,
  fc.webUrl({ withQueryParameters: true }),
);

const featuresArb = fc.oneof(
  fc.constant(''),
  fc.constantFrom('noopener', 'noreferrer', 'noopener,noreferrer', 'left=10,top=10', 'popup=1', 'popup=yes,noopener'),
  fc.integer({ min: 100, max: 1600 }).map((n) => `width=${n}`),
  fc.integer({ min: 100, max: 1200 }).map((n) => `height=${n}`),
  fc
    .tuple(fc.integer({ min: 100, max: 1600 }), fc.integer({ min: 100, max: 1200 }))
    .map(([w, h]) => `width=${w},height=${h},scrollbars=yes`),
);

const windowOpenUrlArb = fc.oneof(
  fc.constant(''),
  fc.constant('about:blank'),
  identityProviderUrlArb,
  captchaUrlArb,
  benignUrlArb,
  fc.webUrl(),
);

const dispositionArb = fc.constantFrom('default', 'foreground-tab', 'background-tab', 'new-window', 'other');
const activeTabArb = fc.option(
  fc.record({ spaceId: fc.constantFrom('space-study', 'space-work', 'space-leisure', 'space-1700000000000') }),
  { nil: null },
);

const darkModeUrlArb = fc
  .oneof(
    fc.tuple(schemeArb, benignHostArb, pathArb, queryArb).map(([s, h, p, q]) => `${s}://${h}${p}${q}`),
    fc.tuple(benignHostArb, pathSeg).map(([h, f]) => `https://${h}/files/${f}.pdf`),
    fc.tuple(benignHostArb, pathSeg).map(([h, f]) => `https://${h}/files/${f}.pdf?dl=1`),
    identityProviderUrlArb,
    captchaUrlArb,
    keywordPathUrlArb,
    fc.constantFrom('neutrino://newtab', 'neutrino://settings', 'about:blank', 'about:srcdoc'),
    label.map((l) => `neutrino://${l}`),
    label.map((l) => `about:${l}`),
    fc.webUrl({ withQueryParameters: true }),
  )
  // Empty URLs never reach dom-ready injection, and native-dark hosts are the intended change.
  .filter((u) => u !== '' && !isNativeDarkForTest(u));

const hourDateArb = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }), fc.integer({ min: 1, max: 28 }))
  .map(([h, m, d]) => new Date(2024, 0, d, h, m, 0));

/** Non-empty names that are already trimmed (whitespace-only names are bug condition 1.13). */
const userNameArb = fc.oneof(
  fc.constantFrom('Ana', 'Mei Ling', "O'Brien", 'Jean-Luc', 'Zoë', 'Søren', 'अनन्या', '李雷'),
  fc.stringMatching(/^[A-Za-z]([A-Za-z '-]{0,16}[A-Za-z])?$/),
  fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim() === s && s.length > 0),
);

// ---------------------------------------------------------------------------
// Property 10: shield decisions and stats outside YouTube playback (3.8, 3.9, 3.10)
// ---------------------------------------------------------------------------

describe('Property 10 (Preservation): shield decisions and stats outside YouTube playback', () => {
  /** **Validates: Requirements 3.8, 3.9** */
  it('checkUrl returns the same decision and stats change for any non-playback-critical URL sequence', () => {
    fc.assert(
      fc.property(fc.array(shieldUrlArb, { minLength: 1, maxLength: 25 }), (urls) => {
        const original = new OriginalShieldEngine();
        const live = createLiveShieldEngine();
        for (const url of urls) {
          const before = live.getStats();
          const originalBefore = original.getStats();
          const o = original.checkUrl(url);
          const l = live.checkUrl(url);
          expect({ blocked: l.blocked, category: l.category, rule: l.rule, domain: l.domain }).toEqual({
            blocked: o.blocked,
            category: o.category,
            rule: o.rule,
            domain: o.domain,
          });
          const liveDelta = diffStats(before, live.getStats());
          const originalDelta = diffStats(originalBefore, original.getStats());
          expect(liveDelta).toEqual(originalDelta);
        }
        expect(live.getStats()).toEqual(original.getStats());
      }),
      { numRuns: NUM_RUNS },
    );
  });

  /** **Validates: Requirements 3.9** */
  it('the request handler cancels and raises neutrino:tracker-blocked exactly as before', () => {
    fc.assert(
      fc.property(fc.array(fc.oneof(shieldUrlArb, authDomainUrlArb).filter(inShieldPreservationDomain), { maxLength: 20 }), (urls) => {
        const original = new OriginalShieldEngine();
        const live = createLiveShieldEngine();
        for (const url of urls) {
          const o = originalRequestDecision(url, original, originalIsAuthOrSecurityUrl);
          const l = liveRequestDecision(url, live);
          expect(l).toEqual(o);
        }
        expect(live.getStats()).toEqual(original.getStats());
      }),
      { numRuns: NUM_RUNS },
    );
  });

  /** **Validates: Requirements 3.10** */
  it('with shields off nothing is blocked, stats stay at zero and no ad script or CSS is injected', () => {
    const anyUrl = fc.oneof(shieldUrlArb, trackerUrlArb, adPatternUrlArb, benignUrlArb, fc.constant('https://www.youtube.com/ptracking?ei=x'));
    fc.assert(
      fc.property(fc.array(anyUrl, { maxLength: 20 }), (urls) => {
        const live = createLiveShieldEngine();
        live.setEnabled(false);
        const zero = live.getStats();
        for (const url of urls) {
          expect(live.checkUrl(url).blocked).toBe(false);
          expect(liveRequestDecision(url, live).cancel).toBe(false);
          expect(liveDomReadyAdInjection(url, false)).toEqual({ cosmeticCss: false, youtubeAdScript: false });
          expect(liveDomReadyAdInjection(url, false)).toEqual(originalDomReadyAdInjection(url, false));
        }
        expect(live.getStats()).toEqual(zero);
        expect(zero.totalBlocked).toBe(0);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('observed baseline examples (unfixed code)', () => {
    const live = createLiveShieldEngine();
    expect(live.checkUrl('https://ads.x7.doubleclick.net/pixel?id=1')).toEqual({
      blocked: true,
      domain: 'ads.x7.doubleclick.net',
      category: 'Advertising',
      rule: 'Blocklist: doubleclick.net',
    });
    expect(live.checkUrl('https://www.google-analytics.com/g/collect?v=2')).toMatchObject({
      blocked: true,
      category: 'Analytics',
      rule: 'Blocklist: google-analytics.com',
    });
    expect(live.checkUrl('https://cdn.fpjs.sh/v3')).toMatchObject({ blocked: true, category: 'Fingerprinting' });
    expect(live.checkUrl('https://www.youtube.com/api/stats/ads?x')).toEqual({
      blocked: true,
      domain: 'www.youtube.com',
      category: 'Advertising',
      rule: 'Pattern: ad-endpoint',
    });
    expect(live.checkUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({ blocked: false, domain: 'www.youtube.com' });
    expect(live.checkUrl('not a url')).toEqual({ blocked: false, domain: '' });
    expect(live.getStats()).toEqual({
      totalBlocked: 4,
      adsBlocked: 2,
      trackersBlocked: 0,
      analyticsBlocked: 1,
      fingerprintersBlocked: 1,
      dataSavedKb: 4 * 54,
    });
  });
});

function diffStats(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of Object.keys(b)) out[k] = b[k] - (a[k] ?? 0);
  return out;
}

// ---------------------------------------------------------------------------
// Property 11: auth, popup and tab routing (3.1, 3.2, 3.3, 3.4)
// ---------------------------------------------------------------------------

describe('Property 11 (Preservation): auth, popup and tab routing', () => {
  /** **Validates: Requirements 3.1, 3.2** */
  it('isAuthOrSecurityUrl is unchanged for identity-provider, CAPTCHA, auth-path and arbitrary URLs', () => {
    fc.assert(
      fc.property(authDomainUrlArb, (url) => {
        expect(liveIsAuthOrSecurityUrl(url)).toBe(originalIsAuthOrSecurityUrl(url));
      }),
      { numRuns: NUM_RUNS * 2 },
    );
  });

  /** **Validates: Requirements 3.1, 3.2** */
  it('identity-provider and CAPTCHA URLs stay exempt from shields', () => {
    fc.assert(
      fc.property(fc.oneof(identityProviderUrlArb, captchaUrlArb), (url) => {
        expect(liveIsAuthOrSecurityUrl(url)).toBe(true);
        expect(liveRequestDecision(url, createLiveShieldEngine()).cancel).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  /** **Validates: Requirements 3.1, 3.3, 3.4** */
  it('window-open requests get the same popup-or-tab decision, size, partition and parent (title excluded)', () => {
    const mainWindow = { id: 'main-window-sentinel' };
    fc.assert(
      fc.property(windowOpenUrlArb, dispositionArb, featuresArb, activeTabArb, (url, disposition, features, activeTab) => {
        const details = { url, disposition, features };
        const o = originalWindowOpenDecision(details, { isAuthOrSecurityUrl: originalIsAuthOrSecurityUrl, mainWindow, activeTab });
        const l = liveWindowOpenDecision(details, { mainWindow, activeTab });
        expect(l.action).toBe(o.action);
        if (o.action === 'allow' && l.action === 'allow') {
          const { title: _oTitle, ...oOpts } = o.overrideBrowserWindowOptions;
          const { title: _lTitle, ...lOpts } = l.overrideBrowserWindowOptions;
          expect(lOpts).toEqual(oOpts);
          expect(lOpts.parent).toBe(mainWindow);
          expect(lOpts.webPreferences.partition).toBe('persist:neutrino');
        } else {
          expect(l.createTab).toEqual(o.createTab);
        }
      }),
      { numRuns: NUM_RUNS * 2 },
    );
  });

  it('observed baseline examples (unfixed code)', () => {
    const mainWindow = { id: 'main' };
    expect(liveIsAuthOrSecurityUrl('https://github.com/login/oauth/authorize')).toBe(true);
    expect(liveIsAuthOrSecurityUrl('https://challenges.cloudflare.com/turnstile/v0/api.js')).toBe(true);
    expect(liveIsAuthOrSecurityUrl('https://example.com/blog')).toBe(false);

    const popup = liveWindowOpenDecision(
      { url: 'https://example.com/share', disposition: 'new-window', features: 'width=600,height=500' },
      { mainWindow, activeTab: { spaceId: 'space-work' } },
    );
    expect(popup.action).toBe('allow');
    if (popup.action === 'allow') {
      expect(popup.overrideBrowserWindowOptions).toMatchObject({
        width: 540,
        height: 700,
        frame: true,
        modal: false,
        parent: mainWindow,
        webPreferences: { partition: 'persist:neutrino', contextIsolation: true, nodeIntegration: false, sandbox: false },
      });
    }

    const tab = liveWindowOpenDecision(
      { url: 'https://example.com/article', disposition: 'foreground-tab', features: '' },
      { mainWindow, activeTab: { spaceId: 'space-work' } },
    );
    expect(tab).toEqual({ action: 'deny', createTab: { url: 'https://example.com/article', spaceId: 'space-work' } });

    const tabNoActive = liveWindowOpenDecision(
      { url: 'https://example.com/a', disposition: 'background-tab', features: 'noopener' },
      { mainWindow, activeTab: null },
    );
    expect(tabNoActive).toEqual({ action: 'deny', createTab: { url: 'https://example.com/a', spaceId: 'space-study' } });
  });
});

// ---------------------------------------------------------------------------
// Property 12: dark mode on other sites and pages (3.5, 3.6, 3.17)
// ---------------------------------------------------------------------------

function walkSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkSourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('Property 12 (Preservation): dark mode on sites without a native dark theme', () => {
  /** **Validates: Requirements 3.5, 3.6** */
  it('the inject-or-skip decision is unchanged for ordinary, auth, neutrino:// and about: URLs', () => {
    fc.assert(
      fc.property(darkModeUrlArb, (url) => {
        expect(liveShouldInjectDarkReader(url)).toBe(originalIsDarkReaderEligible(url));
      }),
      { numRuns: NUM_RUNS * 2 },
    );
  });

  /** **Validates: Requirements 3.5** */
  it('DarkReader settings stay brightness 100, contrast 95, sepia 0 everywhere they are enabled', () => {
    expect(liveDarkReaderSettings).toEqual(DARK_READER_SETTINGS);
    expect({ ...liveDarkReaderSettings }).toEqual({ brightness: 100, contrast: 95, sepia: 0 });

    // Every inline `DarkReader.enable({...})` literal in the app source must use the same settings.
    const files = [...walkSourceFiles(path.join(REPO_ROOT, 'src', 'main')), ...walkSourceFiles(path.join(REPO_ROOT, 'src', 'renderer'))];
    const literals: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/DarkReader\.enable\(\s*\{([^}]*)\}/g)) {
        literals.push(m[1].replace(/\s+/g, '').replace(/,$/, ''));
      }
    }
    for (const lit of literals) {
      expect(lit).toBe('brightness:100,contrast:95,sepia:0');
    }
  });

  /** **Validates: Requirements 3.17** */
  it('the PDF viewer dark style is still applied by the renderer', () => {
    const files = walkSourceFiles(path.join(REPO_ROOT, 'src', 'renderer'));
    const all = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    expect(all).toContain(PDF_DARK_FILTER);
    expect(all).toContain("includes('.pdf?')");
    expect(all).toContain("includes('application/pdf')");
  });

  it('observed baseline examples (unfixed code)', () => {
    expect(liveShouldInjectDarkReader('https://example.com/')).toBe(true);
    expect(liveShouldInjectDarkReader('https://news.ycombinator.com/item?id=1')).toBe(true);
    expect(liveShouldInjectDarkReader('https://accounts.google.com/v3/signin/identifier')).toBe(false);
    expect(liveShouldInjectDarkReader('https://example.com/login')).toBe(false);
    expect(liveShouldInjectDarkReader('neutrino://newtab')).toBe(false);
    expect(liveShouldInjectDarkReader('about:blank')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Property 13: named greetings, MCP tools, safe permissions (3.12, 3.13, 3.15)
// ---------------------------------------------------------------------------

function memoryStorage(entries: Record<string, string>) {
  return { getItem: (k: string) => (k in entries ? entries[k] : null) };
}

describe('Property 13 (Preservation): named greetings', () => {
  /** **Validates: Requirements 3.13** */
  it('formatGreeting equals the original for every non-empty name and hour', () => {
    fc.assert(
      fc.property(hourDateArb, userNameArb, (date, name) => {
        expect(liveFormatGreeting(date, name)).toBe(originalFormatGreeting(date, name));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  /** **Validates: Requirements 3.13** */
  it('a name saved by the welcome modal greets the same on the home screen and in the MCP drawer', () => {
    fc.assert(
      fc.property(hourDateArb, userNameArb, fc.constantFrom('dark', 'light'), (date, name, theme) => {
        // WelcomeModal stores only neutrino_user_profile.
        const storage = memoryStorage({ neutrino_user_profile: JSON.stringify({ name, theme }) });
        const live = liveFormatGreeting(date, liveStoredUserName(storage));
        expect(live).toBe(originalHomescreenGreeting(date, undefined, storage));
        expect(live).toBe(originalMcpGreeting(date, storage));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('observed baseline example (unfixed code)', () => {
    expect(liveFormatGreeting(new Date(2024, 0, 15, 9, 0), 'Ana')).toBe('Good morning, Ana');
    expect(liveFormatGreeting(new Date(2024, 0, 15, 13, 30), 'Ana')).toBe('Good afternoon, Ana');
    expect(liveFormatGreeting(new Date(2024, 0, 15, 21, 0), 'Ana')).toBe('Good evening, Ana');
  });
});

describe('Property 13 (Preservation): MCP tools', () => {
  const managers: ZenResourceManager[] = [];
  afterEach(() => {
    while (managers.length) managers.pop()!.destroy();
  });

  type Sent = { channel: string; payload: any };

  function setup() {
    const McpCtor = McpServer as unknown as new (opts?: { version: string }) => McpServer;
    const mcp = new McpCtor({ version: '0.2.0' });
    const engine = createLiveShieldEngine();
    const resources = new ZenResourceManager();
    managers.push(resources);
    const storage = {
      loadState: () => ({
        spaces: [
          { id: 'space-study', name: 'Study', icon: 'BookOpen', color: '#E4E4E7' },
          { id: 'space-work', name: 'Work', icon: 'Briefcase', color: '#A1A1AA' },
          { id: 'space-leisure', name: 'Leisure', icon: 'Coffee', color: '#71717A' },
        ],
        bookmarks: [],
        settings: {},
      }),
      saveState: () => {},
    };
    const sent: Sent[] = [];
    const mainWindow = { isDestroyed: () => false, webContents: { send: (channel: string, payload: any) => sent.push({ channel, payload }) } };
    const manager = new BrowserManager(engine, resources, mcp, storage as any);
    manager.setMainWindow(mainWindow as any);
    return { mcp, engine, sent };
  }

  /** Replaces random tab ids with T1, T2... and checks / masks the random Zen memory figure. */
  function makeNormalizer() {
    const aliases = new Map<string, string>();
    const alias = (id: string) => {
      if (!aliases.has(id)) aliases.set(id, `T${aliases.size + 1}`);
      return aliases.get(id)!;
    };
    const resolve = (a: string) => [...aliases.entries()].find(([, v]) => v === a)?.[0] ?? a;
    const normalize = (v: any): any => {
      if (typeof v === 'string') return /^tab-[a-z0-9]+$/.test(v) ? alias(v) : v;
      if (Array.isArray(v)) return v.map(normalize);
      if (v && typeof v === 'object') {
        const out: any = {};
        for (const [k, val] of Object.entries(v)) {
          if (k === 'memorySavedMb' && typeof val === 'number') {
            // ZenResourceManager.sleepTab estimates 65-109 MB per sleeping tab.
            out[k] = val >= 65 && val < 110 ? '<65-109>' : val;
          } else out[k] = normalize(val);
        }
        return out;
      }
      return v;
    };
    return { normalize, resolve };
  }

  /** **Validates: Requirements 3.12** */
  it('all eight tools return the same results and log entries for recorded calls', async () => {
    const { mcp, engine, sent } = setup();
    const { normalize, resolve } = makeNormalizer();

    // tools/list keeps the same eight tools in the same order.
    const list: any = await mcp.handleMessage({ jsonrpc: '2.0', id: 0, method: 'tools/list' });
    expect(list.result.tools.map((t: any) => t.name)).toEqual([
      'browser_get_status',
      'browser_navigate',
      'browser_list_tabs',
      'browser_create_tab',
      'browser_close_tab',
      'browser_get_adblock_stats',
      'browser_zen_optimize',
      'browser_media_control',
    ]);

    // One blocked request so the stats tool has something to report.
    engine.checkUrl('https://ads.doubleclick.net/pixel');

    const steps: Array<{ name: string; args: (r: (a: string) => string) => Record<string, unknown>; expected: unknown }> = [
      {
        name: 'browser_get_status',
        args: () => ({}),
        expected: {
          status: 'online',
          engine: 'Chromium / Blink',
          browser: 'Neutrino Browser',
          mcpReady: true,
          features: ['Brave-Shields', 'Zen-Sleep', 'Arc-Spaces', 'MCP-Server'],
        },
      },
      { name: 'browser_list_tabs', args: () => ({}), expected: { count: 0, activeTabId: null, tabs: [] } },
      {
        name: 'browser_navigate',
        args: () => ({ url: 'https://example.com/?utm_source=x&a=1' }),
        expected: { success: true, tabId: 'T1', url: 'https://example.com/?a=1' },
      },
      {
        name: 'browser_create_tab',
        args: () => ({ url: 'https://news.ycombinator.com/', spaceId: 'space-work' }),
        expected: { tabId: 'T2', url: 'https://news.ycombinator.com/', spaceId: 'space-work' },
      },
      {
        name: 'browser_navigate',
        args: () => ({ url: 'https://example.org/page?fbclid=abc' }),
        expected: { success: true, tabId: 'T2', url: 'https://example.org/page' },
      },
      {
        name: 'browser_navigate',
        args: (r) => ({ url: 'https://example.net/a?gclid=1&q=2', tabId: r('T1') }),
        expected: { success: true, tabId: 'T1', url: 'https://example.net/a?q=2' },
      },
      {
        name: 'browser_list_tabs',
        args: () => ({ spaceId: 'space-work' }),
        expected: {
          count: 1,
          activeTabId: 'T2',
          tabs: [{ id: 'T2', title: 'New Tab', url: 'https://example.org/page', spaceId: 'space-work', isPinned: false, isSleeping: false }],
        },
      },
      {
        name: 'browser_get_adblock_stats',
        args: () => ({}),
        expected: { totalBlocked: 1, adsBlocked: 1, trackersBlocked: 0, analyticsBlocked: 0, fingerprintersBlocked: 0, dataSavedKb: 54 },
      },
      {
        name: 'browser_zen_optimize',
        args: () => ({}),
        expected: { success: true, memorySavedMb: '<65-109>', sleepingTabsCount: 1 },
      },
      {
        name: 'browser_list_tabs',
        args: () => ({}),
        expected: {
          count: 2,
          activeTabId: 'T2',
          tabs: [
            { id: 'T1', title: 'New Tab', url: 'https://example.net/a?q=2', spaceId: 'space-study', isPinned: false, isSleeping: true },
            { id: 'T2', title: 'New Tab', url: 'https://example.org/page', spaceId: 'space-work', isPinned: false, isSleeping: false },
          ],
        },
      },
      { name: 'browser_media_control', args: () => ({ action: 'pause' }), expected: { success: true, targetTabId: 'T2', action: 'pause' } },
      {
        name: 'browser_media_control',
        args: (r) => ({ action: 'seek', tabId: r('T1'), value: 42 }),
        expected: { success: true, targetTabId: 'T1', action: 'seek', value: 42 },
      },
      { name: 'browser_close_tab', args: (r) => ({ tabId: r('T1') }), expected: { success: true, closedTabId: 'T1' } },
      {
        name: 'browser_list_tabs',
        args: () => ({}),
        expected: {
          count: 1,
          activeTabId: 'T2',
          tabs: [{ id: 'T2', title: 'New Tab', url: 'https://example.org/page', spaceId: 'space-work', isPinned: false, isSleeping: false }],
        },
      },
    ];

    const expectedLog: unknown[] = [{ direction: 'in', method: 'tools/list', data: undefined }];
    let id = 1;
    for (const step of steps) {
      const args = step.args(resolve);
      const params = { name: step.name, arguments: args };
      const res: any = await mcp.handleMessage({ jsonrpc: '2.0', id, method: 'tools/call', params });
      expect(res.error).toBeUndefined();
      expect(res.id).toBe(id);
      expect(res.result.content).toHaveLength(1);
      expect(res.result.content[0].type).toBe('text');
      const parsed = normalize(JSON.parse(res.result.content[0].text));
      // JSON.stringify drops undefined fields (e.g. media_control value), so compare via JSON.
      expect(parsed).toEqual(JSON.parse(JSON.stringify(step.expected)));
      expectedLog.push({ direction: 'in', method: 'tools/call', data: normalize(params) });
      expectedLog.push({ direction: 'out', method: step.name, data: step.expected });
      id++;
    }

    // The raw response text is the pretty-printed tool result that was logged.
    const logs = mcp.getLogs();
    const outs = logs.filter((e) => e.direction === 'out');
    expect(outs).toHaveLength(steps.length);
    for (const e of logs) expect(typeof e.timestamp).toBe('number');

    const normalizedLogs = logs.map(({ timestamp: _t, ...rest }) => normalize(rest));
    expect(JSON.parse(JSON.stringify(normalizedLogs))).toEqual(JSON.parse(JSON.stringify(expectedLog)));

    // browser_media_control still forwards the command to the renderer.
    const mediaCommands = sent.filter((s) => s.channel === 'neutrino:media-command').map((s) => normalize(s.payload));
    expect(mediaCommands).toEqual([
      { action: 'pause', tabId: 'T2' },
      { action: 'seek', tabId: 'T1', value: 42 },
    ]);
  });

  /** **Validates: Requirements 3.12** */
  it('unknown tools and missing names keep the same JSON-RPC errors', async () => {
    const { mcp } = setup();
    expect(await mcp.handleMessage({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'nope' } })).toEqual({
      jsonrpc: '2.0',
      id: 7,
      error: { code: -32601, message: 'Tool not found: nope' },
    });
    expect(await mcp.handleMessage({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: {} })).toEqual({
      jsonrpc: '2.0',
      id: 8,
      error: { code: -32602, message: 'Missing tool name parameter' },
    });
    expect(await mcp.handleMessage('{not json')).toEqual({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  });
});

describe('Property 13 (Preservation): safe permissions are granted without a prompt', () => {
  function memoryPermissionStore() {
    const data = new Map<string, 'allow' | 'deny'>();
    return {
      get: (origin: string, permission: string) => data.get(`${origin} ${permission}`),
      set: (origin: string, permission: string, decision: 'allow' | 'deny') => void data.set(`${origin} ${permission}`, decision),
    };
  }

  const originArb = fc
    .tuple(fc.constantFrom('https', 'http'), fc.array(label, { minLength: 1, maxLength: 3 }), fc.constantFrom('com', 'org', 'io', 'test'))
    .map(([s, labels, tld]) => `${s}://${labels.join('.')}.${tld}`);

  /** **Validates: Requirements 3.15** */
  it('fullscreen, pointerLock, clipboard-sanitized-write and mediaKeySystem are granted with zero prompts', async () => {
    await fc.assert(
      fc.asyncProperty(originArb, fc.constantFrom(...SAFE_PERMISSIONS), pathSeg, async (origin, permission, page) => {
        let prompts = 0;
        const promptFn = async () => {
          prompts++;
          return { allow: false, remember: false };
        };
        const { checkHandler, requestHandler } = createLivePermissionHandlers(memoryPermissionStore(), promptFn) as any;
        const requestingUrl = `${origin}/${page}`;
        const webContents = { id: 1, getURL: () => requestingUrl };
        const details = { requestingUrl, isMainFrame: true };

        const granted = await new Promise<boolean | 'no-callback'>((resolve) => {
          const timer = setTimeout(() => resolve('no-callback'), 2000);
          requestHandler(webContents, permission, (ok: boolean) => {
            clearTimeout(timer);
            resolve(ok);
          }, details);
        });
        expect(granted).toBe(true);
        expect(checkHandler(webContents, permission, origin, details)).toBe(true);
        expect(prompts).toBe(0);
      }),
      { numRuns: 100 },
    );
  });
});
