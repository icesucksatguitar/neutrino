import { describe, it, expect } from 'vitest';
import {
  WebviewKindTracker,
  applyWebviewPreferences,
  classifySender,
  isPageWebviewKind,
  parseCapturePayload,
  parseCommitPayload,
  parseConfirmPayload,
  parseEditPayload,
  parseFramePayload,
  parseOrigin,
  parsePromptResponse,
  profileForPartition,
  resolveFrameContext,
  MAX_PASSWORD_LENGTH,
  type SenderInfo,
} from '../../../src/main/passwords/ipcPolicy';
import {
  ASSISTANT_WEBVIEW_MARKER,
  ASSISTANT_WEBVIEW_MARKER_KEY,
  hasAssistantMarker,
  withAssistantMarker,
} from '../../../src/main/passwords/webviewMarker';
import { partitionForProfile } from '../../../src/main/profiles/partition';

const PRELOAD = '/app/dist-main/passwords/passwordPreload.js';

describe('assistant webview marker', () => {
  it('appends the marker once', () => {
    const once = withAssistantMarker('contextIsolation=yes,nodeIntegration=no');
    expect(once).toBe(`contextIsolation=yes,nodeIntegration=no,${ASSISTANT_WEBVIEW_MARKER}`);
    expect(withAssistantMarker(once)).toBe(once);
  });

  it('recognises the parsed marker value', () => {
    expect(hasAssistantMarker({ [ASSISTANT_WEBVIEW_MARKER_KEY]: true })).toBe(true);
    expect(hasAssistantMarker({ [ASSISTANT_WEBVIEW_MARKER_KEY]: 'yes' })).toBe(true);
    expect(hasAssistantMarker({ [ASSISTANT_WEBVIEW_MARKER_KEY]: false })).toBe(false);
    expect(hasAssistantMarker({})).toBe(false);
    expect(hasAssistantMarker(null)).toBe(false);
  });
});

describe('applyWebviewPreferences', () => {
  it('gives page webviews the password preload in every frame and drops a renderer preload', () => {
    const prefs: Record<string, unknown> = { preload: '/evil.js', preloadURL: 'file:///evil.js', nodeIntegration: true };
    expect(applyWebviewPreferences(prefs, PRELOAD)).toBe('page');
    expect(prefs).toMatchObject({
      preload: PRELOAD,
      nodeIntegrationInSubFrames: true,
      nodeIntegration: false,
      contextIsolation: true,
    });
    expect(prefs.preloadURL).toBeUndefined();
  });

  it('gives assistant webviews no preload', () => {
    const prefs: Record<string, unknown> = { [ASSISTANT_WEBVIEW_MARKER_KEY]: true, preload: '/evil.js' };
    expect(applyWebviewPreferences(prefs, PRELOAD)).toBe('assistant');
    expect(prefs.preload).toBeUndefined();
    expect(prefs.nodeIntegrationInSubFrames).toBe(false);
    expect(prefs.nodeIntegration).toBe(false);
  });
});

describe('webview kind tracking', () => {
  it('uses each will-attach decision once', () => {
    const t = new WebviewKindTracker();
    t.noteWillAttach('page');
    expect(t.takeForNewWebview()).toBe('page');
    expect(t.takeForNewWebview()).toBeNull();
    t.noteWillAttach('assistant');
    t.cancel();
    expect(t.takeForNewWebview()).toBeNull();
  });

  it('decides page-ness from the decision, else from final prefs, else fails closed', () => {
    expect(isPageWebviewKind('page', null, PRELOAD)).toBe(true);
    expect(isPageWebviewKind('assistant', { preload: PRELOAD }, PRELOAD)).toBe(false);
    expect(isPageWebviewKind(null, { preload: PRELOAD }, PRELOAD)).toBe(true);
    expect(isPageWebviewKind(null, { preload: PRELOAD, [ASSISTANT_WEBVIEW_MARKER_KEY]: true }, PRELOAD)).toBe(false);
    expect(isPageWebviewKind(null, { preload: '/other.js' }, PRELOAD)).toBe(false);
    expect(isPageWebviewKind(null, null, PRELOAD)).toBe(false);
  });
});

describe('classifySender', () => {
  const policy = { mainWindowWebContentsId: 1, isPageWebview: (id: number) => id === 5 };
  const info = (over: Partial<SenderInfo>): SenderInfo => ({
    webContentsId: 1,
    type: 'window',
    hostWebContentsId: null,
    isMainFrame: true,
    ...over,
  });

  it('accepts the main window top frame as the UI', () => {
    expect(classifySender(info({}), policy)).toBe('main-ui');
  });

  it('rejects subframes of the main window and other windows', () => {
    expect(classifySender(info({ isMainFrame: false }), policy)).toBe('other');
    expect(classifySender(info({ webContentsId: 9 }), policy)).toBe('other');
  });

  it('accepts only preloaded webviews hosted by the main window as pages, in any frame', () => {
    expect(classifySender(info({ webContentsId: 5, type: 'webview', hostWebContentsId: 1, isMainFrame: false }), policy)).toBe('page');
    // assistant webview (no password preload)
    expect(classifySender(info({ webContentsId: 6, type: 'webview', hostWebContentsId: 1 }), policy)).toBe('other');
    // hosted elsewhere
    expect(classifySender(info({ webContentsId: 5, type: 'webview', hostWebContentsId: 2 }), policy)).toBe('other');
  });

  it('accepts nothing when there is no main window', () => {
    expect(classifySender(info({}), { ...policy, mainWindowWebContentsId: null })).toBe('other');
  });
});

describe('resolveFrameContext', () => {
  const frame = { processId: 3, routingId: 7, origin: 'https://login.example.com' };

  it('uses the sender frame identity and origin', () => {
    expect(
      resolveFrameContext({ profileId: 'p1', webContentsId: 5, senderFrame: frame, hintOrigin: 'https://login.example.com' }),
    ).toEqual({ profileId: 'p1', webContentsId: 5, frameId: '3:7', frameOrigin: 'https://login.example.com' });
  });

  it('rejects a hint that disagrees with the real frame origin', () => {
    expect(
      resolveFrameContext({ profileId: 'p1', webContentsId: 5, senderFrame: frame, hintOrigin: 'https://evil.example' }),
    ).toBeNull();
  });

  it('rejects missing frames, unknown profiles and non-http origins', () => {
    const base = { profileId: 'p1', webContentsId: 5, hintOrigin: 'https://login.example.com' };
    expect(resolveFrameContext({ ...base, senderFrame: null })).toBeNull();
    expect(resolveFrameContext({ ...base, profileId: null, senderFrame: frame })).toBeNull();
    expect(
      resolveFrameContext({ ...base, senderFrame: { ...frame, origin: 'null' }, hintOrigin: 'null' }),
    ).toBeNull();
  });
});

describe('profileForPartition', () => {
  it('maps a session partition back to its profile', () => {
    const ids = ['default', 'work'];
    expect(profileForPartition('persist:neutrino', ids, partitionForProfile)).toBe('default');
    expect(profileForPartition(partitionForProfile('work'), ids, partitionForProfile)).toBe('work');
    expect(profileForPartition('persist:other', ids, partitionForProfile)).toBeNull();
    expect(profileForPartition(null, ids, partitionForProfile)).toBeNull();
  });
});

describe('payload parsing', () => {
  it('parses captures and rejects bad ones', () => {
    expect(parseCapturePayload({ frameOrigin: 'https://a.test', username: 'u', password: 'p' })).toEqual({
      frameOrigin: 'https://a.test',
      username: 'u',
      password: 'p',
    });
    expect(parseCapturePayload({ frameOrigin: 'https://a.test', username: 'u', password: '' })).toBeNull();
    expect(parseCapturePayload({ frameOrigin: 'https://a.test', username: 1, password: 'p' })).toBeNull();
    expect(
      parseCapturePayload({ frameOrigin: 'https://a.test', username: 'u', password: 'x'.repeat(MAX_PASSWORD_LENGTH + 1) }),
    ).toBeNull();
    expect(parseCapturePayload(null)).toBeNull();
  });

  it('parses frame payloads with an optional id key', () => {
    expect(parseFramePayload({ frameOrigin: 'https://a.test' })).toEqual({ frameOrigin: 'https://a.test' });
    expect(parseFramePayload({ frameOrigin: 'https://a.test', token: 't1' }, 'token')).toEqual({
      frameOrigin: 'https://a.test',
      token: 't1',
    });
    expect(parseFramePayload({ frameOrigin: 'https://a.test' }, 'token')).toBeNull();
  });

  it('parses prompt responses, edits, confirms, origins and commits', () => {
    expect(parsePromptResponse({ promptId: 'p', action: 'never' })).toEqual({ promptId: 'p', action: 'never' });
    expect(parsePromptResponse({ promptId: 'p', action: 'steal' })).toBeNull();

    expect(parseEditPayload({ credentialId: 'c', username: 'bob' })).toEqual({ credentialId: 'c', patch: { username: 'bob' } });
    expect(parseEditPayload({ credentialId: 'c', password: '' })).toBeNull();
    expect(parseEditPayload({ credentialId: 'c' })).toBeNull();

    expect(parseConfirmPayload({ confirmId: 'x', accepted: true })).toEqual({ confirmId: 'x', accepted: true });
    expect(parseConfirmPayload({ confirmId: 'x', accepted: 'yes' })).toBeNull();

    expect(parseOrigin('HTTPS://Example.com:443/path')).toBe('https://example.com');
    expect(parseOrigin('javascript:alert(1)')).toBeNull();

    expect(parseCommitPayload({ importId: 'i', choices: { 0: 'replace', 1: 'keep', 2: 'bogus', x: 'replace' } })).toEqual({
      importId: 'i',
      choices: { 0: 'replace', 1: 'keep' },
    });
    expect(parseCommitPayload({ importId: 'i' })).toEqual({ importId: 'i', choices: {} });
    expect(parseCommitPayload({ importId: 'i', choices: [] })).toBeNull();
  });
});
