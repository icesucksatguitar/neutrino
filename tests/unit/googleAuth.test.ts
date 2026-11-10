/**
 * Google sign-in handling: detection, refusal classification, handoff target selection and the
 * per-webContents tracker (same-tab and popup flows, cancellation, other identity providers).
 * Pure module tests; the Electron wiring is exercised by tests/integration/authHandoffFlow.cjs.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import {
  GoogleAuthTracker,
  getGoogleAuthRejection,
  isGoogleOAuthRequest,
  isOpenableExternalUrl,
  isSafeHandoffOrigin,
  resolveHandoffTarget,
} from '../../src/main/googleAuth';
import { isAuthOrSecurityUrl } from '../../src/main/urlClassifier';

const OAUTH_AUTHORIZE =
  'https://accounts.google.com/o/oauth2/v2/auth?client_id=123.apps.googleusercontent.com&redirect_uri=https%3A%2F%2Fapp.example.com%2Fapi%2Fauth%2Fcallback%2Fgoogle&response_type=code&scope=openid%20email&state=xyz&code_challenge=abc';
const IDENTIFIER_WITH_OAUTH =
  'https://accounts.google.com/v3/signin/identifier?continue=https%3A%2F%2Faccounts.google.com%2Fsignin%2Foauth%2Fconsent%3Fclient_id%3D1%26redirect_uri%3Dhttps%253A%252F%252Fapp.example.com%252Fcb&flowName=GeneralOAuthFlow';
const REJECTED = 'https://accounts.google.com/v3/signin/rejected?continue=https%3A%2F%2Fmail.google.com%2F&flowName=GlifWebSignIn';
const REJECTED_LEGACY = 'https://accounts.google.com/signin/rejected?rrk=46&hl=en';

/** The authError protobuf Google puts on its "Error 400: disallowed_useragent" page. */
function disallowedUserAgentErrorUrl(): string {
  const message = 'disallowed_useragent';
  const proto = Buffer.concat([Buffer.from([0x0a, message.length]), Buffer.from(message), Buffer.from([0x12, 0x03]), Buffer.from('foo')]);
  const authError = proto.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `https://accounts.google.com/signin/oauth/error?authError=${authError}&client_id=1`;
}

describe('Google OAuth request detection', () => {
  it('detects OAuth, OIDC and Google Identity Services requests on accounts.google.com', () => {
    expect(isGoogleOAuthRequest(OAUTH_AUTHORIZE)).toBe(true);
    expect(isGoogleOAuthRequest('https://accounts.google.com/o/oauth2/auth?client_id=1&redirect_uri=x')).toBe(true);
    expect(isGoogleOAuthRequest('https://accounts.google.com/signin/oauth/consent?authuser=0&part=x')).toBe(true);
    expect(isGoogleOAuthRequest('https://accounts.google.com/gsi/select?client_id=1&ux_mode=popup')).toBe(true);
    expect(isGoogleOAuthRequest(IDENTIFIER_WITH_OAUTH)).toBe(true);
  });

  it("does not treat Google's own sign-in or other Google pages as third-party OAuth", () => {
    expect(isGoogleOAuthRequest('https://accounts.google.com/v3/signin/identifier?continue=https%3A%2F%2Fmail.google.com%2F')).toBe(false);
    expect(isGoogleOAuthRequest('https://www.google.com/search?q=oauth2')).toBe(false);
    expect(isGoogleOAuthRequest('https://myaccount.google.com/')).toBe(false);
  });

  it('matches the exact hostname, so lookalike hosts and other schemes are ignored', () => {
    expect(isGoogleOAuthRequest('https://accounts.google.com.evil.test/o/oauth2/v2/auth?client_id=1')).toBe(false);
    expect(isGoogleOAuthRequest('https://evil.test/accounts.google.com/o/oauth2/v2/auth')).toBe(false);
    expect(isGoogleOAuthRequest('http://accounts.google.com/o/oauth2/v2/auth')).toBe(false);
    expect(getGoogleAuthRejection('https://accounts.google.com.evil.test/v3/signin/rejected')).toBeNull();
  });

  it('never classifies other identity providers as Google', () => {
    const others = [
      'https://appleid.apple.com/auth/authorize?client_id=x&redirect_uri=https://app.example.com/cb&state=s',
      'https://github.com/login/oauth/authorize?client_id=x&state=s',
      'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=x&state=s',
      'https://login.live.com/oauth20_authorize.srf?client_id=x',
      'https://tenant.auth0.com/authorize?client_id=x&state=s',
      'https://clerk.example.com/v1/oauth_callback?code=x',
      'https://abc.supabase.co/auth/v1/authorize?provider=github',
    ];
    for (const url of others) {
      expect(isGoogleOAuthRequest(url)).toBe(false);
      expect(getGoogleAuthRejection(url)).toBeNull();
      // Still treated as auth traffic by the shields, as before.
      expect(isAuthOrSecurityUrl(url)).toBe(true);
    }
  });
});

describe('Google refusal detection', () => {
  it('recognises the "This browser or app may not be secure" page in all known path forms', () => {
    expect(getGoogleAuthRejection(REJECTED)).toBe('browser-not-secure');
    expect(getGoogleAuthRejection(REJECTED_LEGACY)).toBe('browser-not-secure');
    expect(getGoogleAuthRejection('https://accounts.google.com/signin/v2/rejected?x=1')).toBe('browser-not-secure');
  });

  it('recognises Error 400 disallowed_useragent from the encoded authError', () => {
    expect(getGoogleAuthRejection(disallowedUserAgentErrorUrl())).toBe('disallowed-useragent');
  });

  it("leaves the site's own OAuth errors and normal sign-in steps alone", () => {
    const otherError = Buffer.from('\n\x15redirect_uri_mismatch').toString('base64');
    expect(getGoogleAuthRejection(`https://accounts.google.com/signin/oauth/error?authError=${otherError}`)).toBeNull();
    expect(getGoogleAuthRejection('https://accounts.google.com/v3/signin/challenge/pwd?TL=abc')).toBeNull();
    expect(getGoogleAuthRejection(OAUTH_AUTHORIZE)).toBeNull();
    expect(getGoogleAuthRejection('https://accounts.google.com/v3/signin/rejectedfoo')).toBeNull();
  });
});

describe('handoff target: preserves the originating site and never replays OAuth', () => {
  it('prefers the page the sign-in started from', () => {
    expect(resolveHandoffTarget({ originUrl: 'https://chatgpt.com/auth/login', authUrl: OAUTH_AUTHORIZE })).toEqual({
      url: 'https://chatgpt.com/auth/login',
      source: 'origin',
    });
  });

  it('never returns an authorization URL, a callback URL or a Firebase handler', () => {
    const unsafeOrigins = [
      'https://app.example.com/api/auth/callback/google?code=4%2F0Ab&state=xyz',
      'https://app.example.com/cb#access_token=t&state=s',
      'https://proj.firebaseapp.com/__/auth/handler?apiKey=k&providerId=google.com',
      OAUTH_AUTHORIZE,
      'https://user:pass@app.example.com/login',
      'javascript:alert(1)',
      'file:///etc/passwd',
    ];
    for (const originUrl of unsafeOrigins) {
      expect(isSafeHandoffOrigin(originUrl)).toBe(false);
      const target = resolveHandoffTarget({ originUrl, authUrl: OAUTH_AUTHORIZE });
      expect(target).toEqual({ url: 'https://app.example.com/', source: 'redirect-origin' });
    }
  });

  it('falls back to the site origin from redirect_uri, including nested continue and GIS storagerelay', () => {
    expect(resolveHandoffTarget({ authUrl: IDENTIFIER_WITH_OAUTH })).toEqual({ url: 'https://app.example.com/', source: 'redirect-origin' });
    expect(
      resolveHandoffTarget({
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=1&redirect_uri=storagerelay%3A%2F%2Fhttps%2Fshop.example.org%3Fid%3Dauth123&response_type=permission',
      })
    ).toEqual({ url: 'https://shop.example.org/', source: 'redirect-origin' });
  });

  it("returns Google's own continue page for Google sign-in, else the Google sign-in page", () => {
    expect(resolveHandoffTarget({ authUrl: REJECTED })).toEqual({ url: 'https://mail.google.com/', source: 'google-continue' });
    expect(resolveHandoffTarget({ authUrl: 'https://accounts.google.com/v3/signin/identifier?continue=https%3A%2F%2Fevil.test%2F' })).toEqual({
      url: 'https://accounts.google.com/',
      source: 'google-signin',
    });
  });

  it('only http(s) URLs without credentials can be opened externally', () => {
    fc.assert(
      fc.property(fc.webUrl(), (url) => {
        const target = resolveHandoffTarget({ originUrl: url, authUrl: OAUTH_AUTHORIZE });
        expect(target).not.toBeNull();
        expect(isOpenableExternalUrl(target!.url)).toBe(true);
      }),
      { numRuns: 200 }
    );
    expect(isOpenableExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isOpenableExternalUrl('file:///C:/Users/x')).toBe(false);
    expect(isOpenableExternalUrl('neutrino://newtab')).toBe(false);
  });
});

function makeTracker() {
  let n = 0;
  return new GoogleAuthTracker(() => `h${++n}`);
}

describe('tracker: same-tab Google sign-in', () => {
  it('raises one handoff back to the originating page when Google refuses in the tab', () => {
    const t = makeTracker();
    const TAB = 1;
    expect(t.recordNavigation(TAB, 'https://app.example.com/')).toBeNull();
    expect(t.recordNavigation(TAB, 'https://app.example.com/login')).toBeNull();
    expect(t.recordNavigation(TAB, OAUTH_AUTHORIZE)).toBeNull();
    expect(t.recordNavigation(TAB, IDENTIFIER_WITH_OAUTH)).toBeNull();
    const handoff = t.recordNavigation(TAB, REJECTED);
    expect(handoff).toMatchObject({
      provider: 'google',
      reason: 'browser-not-secure',
      sourceId: TAB,
      ownerId: TAB,
      isPopup: false,
      targetUrl: 'https://app.example.com/login',
      targetSource: 'origin',
      siteHost: 'app.example.com',
    });

    // In-page updates of the same refusal page do not raise a second notice.
    expect(t.recordNavigation(TAB, REJECTED + '&hl=en')).toBeNull();
    expect(t.getHandoff(handoff!.handoffId)).toEqual(handoff);
  });

  it('a successful same-tab redirect back to the site raises nothing', () => {
    const t = makeTracker();
    t.recordNavigation(2, 'https://app.example.com/login');
    t.recordNavigation(2, OAUTH_AUTHORIZE);
    t.recordNavigation(2, 'https://accounts.google.com/v3/signin/challenge/pwd?TL=x');
    expect(t.recordNavigation(2, 'https://app.example.com/api/auth/callback/google?code=c&state=xyz')).toBeNull();
    expect(t.recordNavigation(2, 'https://app.example.com/dashboard')).toBeNull();
  });

  it("Google's own sign-in (no website) hands off to the Google service the user wanted", () => {
    const t = makeTracker();
    t.recordNavigation(3, 'https://accounts.google.com/v3/signin/identifier?continue=https%3A%2F%2Fmail.google.com%2F');
    const handoff = t.recordNavigation(3, REJECTED);
    // The tab never showed a regular page before Google, so the Google continue page is used.
    expect(handoff).toMatchObject({ targetUrl: 'https://mail.google.com/', targetSource: 'google-continue' });
  });
});

describe('tracker: Google sign-in popups', () => {
  it('hands off to the opener page and reports the tab that opened the popup', () => {
    const t = makeTracker();
    const TAB = 10;
    const POPUP = 11;
    t.recordNavigation(TAB, 'https://chatgpt.com/auth/login');
    t.registerPopup(POPUP, TAB, 'https://chatgpt.com/auth/login');
    expect(t.isPopup(POPUP)).toBe(true);
    expect(t.recordNavigation(POPUP, 'about:blank')).toBeNull();
    expect(t.recordNavigation(POPUP, OAUTH_AUTHORIZE)).toBeNull();
    const handoff = t.recordNavigation(POPUP, disallowedUserAgentErrorUrl());
    expect(handoff).toMatchObject({
      reason: 'disallowed-useragent',
      isPopup: true,
      sourceId: POPUP,
      ownerId: TAB,
      targetUrl: 'https://chatgpt.com/auth/login',
      targetSource: 'origin',
    });
  });

  it('when the opener URL is unknown it uses the site origin, never the callback', () => {
    const t = makeTracker();
    t.registerPopup(21, 20);
    t.recordNavigation(21, OAUTH_AUTHORIZE);
    expect(t.recordNavigation(21, REJECTED)).toMatchObject({ targetUrl: 'https://app.example.com/', targetSource: 'redirect-origin' });
  });

  it('a popup the user closes before finishing (cancellation) leaves nothing behind', () => {
    const t = makeTracker();
    t.registerPopup(31, 30, 'https://app.example.com/login');
    t.recordNavigation(31, OAUTH_AUTHORIZE);
    t.forget(31);
    expect(t.isPopup(31)).toBe(false);
    // A later, unrelated window reusing the id starts clean.
    expect(t.recordNavigation(31, 'https://example.org/')).toBeNull();
  });

  it('a successful popup flow (redirect to the site callback) raises nothing', () => {
    const t = makeTracker();
    t.registerPopup(41, 40, 'https://app.example.com/login');
    t.recordNavigation(41, OAUTH_AUTHORIZE);
    expect(t.recordNavigation(41, 'https://app.example.com/api/auth/callback/google?code=c&state=xyz')).toBeNull();
  });

  it('GitHub, Microsoft and Apple popups never raise a handoff', () => {
    const t = makeTracker();
    const flows = [
      ['https://github.com/login/oauth/authorize?client_id=x', 'https://github.com/login', 'https://app.example.com/cb?code=1&state=s'],
      ['https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=x', 'https://login.live.com/login.srf', 'https://app.example.com/cb?code=1'],
      ['https://appleid.apple.com/auth/authorize?client_id=x', 'https://appleid.apple.com/auth/authorize?error=user_cancelled_authorize', 'https://app.example.com/cb'],
    ];
    flows.forEach((urls, i) => {
      t.registerPopup(100 + i, 99, 'https://app.example.com/login');
      for (const url of urls) expect(t.recordNavigation(100 + i, url)).toBeNull();
    });
  });
});

describe('tracker: handoff lifecycle', () => {
  it('handoffs are one-shot and unknown or malformed ids are rejected', () => {
    const t = makeTracker();
    t.recordNavigation(1, 'https://app.example.com/login');
    const handoff = t.recordNavigation(1, REJECTED)!;
    expect(t.getHandoff(42)).toBeNull();
    expect(t.getHandoff('nope')).toBeNull();
    expect(t.resolveHandoff(handoff.handoffId)).toEqual(handoff);
    expect(t.resolveHandoff(handoff.handoffId)).toBeNull();
  });

  it('a new refusal after the user retried raises a new handoff', () => {
    const t = makeTracker();
    t.recordNavigation(1, 'https://app.example.com/login');
    const first = t.recordNavigation(1, REJECTED)!;
    t.resolveHandoff(first.handoffId);
    t.recordNavigation(1, 'https://app.example.com/login');
    t.recordNavigation(1, OAUTH_AUTHORIZE);
    const second = t.recordNavigation(1, REJECTED);
    expect(second).not.toBeNull();
    expect(second!.handoffId).not.toBe(first.handoffId);
  });

  it('keeps a bounded number of pending handoffs', () => {
    const t = makeTracker();
    const ids: string[] = [];
    for (let i = 0; i < 30; i++) {
      t.recordNavigation(i, 'https://app.example.com/login');
      ids.push(t.recordNavigation(i, REJECTED)!.handoffId);
    }
    expect(t.getHandoff(ids[0])).toBeNull();
    expect(t.getHandoff(ids[29])).not.toBeNull();
  });
});
