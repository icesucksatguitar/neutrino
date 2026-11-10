// Google sign-in handoff and OAuth popup/redirect lifecycle, in real Electron.
//
// Uses the compiled main-process modules (dist-main/authHandoff.js, windowOpen.js,
// browserIdentity.js, urlClassifier.js) wired the same way src/main/index.ts wires them, with a
// <webview> tab in the persist:neutrino partition and real window.open popups.
//
// Nothing goes to the network and no real account is used: https://app.test, https://github.com and
// https://accounts.google.com are served by protocol.handle on the partition. The fake Google
// either accepts (redirects to the site's callback) or refuses, using the same URLs Google uses
// for "This browser or app may not be secure" and "Error 400: disallowed_useragent".
//
// Run:   npm run build:main && npx electron tests/integration/authHandoffFlow.cjs
//        (Linux CI / containers: xvfb-run -a npx electron --no-sandbox tests/integration/authHandoffFlow.cjs)
// Exit 0 = all scenarios pass. Writes tests/integration/out/authHandoffFlow.json.
// Uses a throwaway userData directory, so the real Neutrino profile is never touched.

const { app, BrowserWindow, session, webContents } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(__dirname, 'out');
const dist = (m) => require(path.join(ROOT, 'dist-main', m));

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'neutrino-auth-')));
app.on('window-all-closed', () => {});
app.userAgentFallback = dist('browserIdentity.js').getBrowserUserAgent();

const { AuthHandoffController, AUTH_HANDOFF_CHANNELS } = dist('authHandoff.js');
const { decideWindowOpen } = dist('windowOpen.js');
const { isAuthOrSecurityUrl } = dist('urlClassifier.js');

const PARTITION = 'persist:neutrino';
const SITE = 'https://app.test';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------ fake web ------------------------------
let googleMode = 'reject'; // 'reject' | 'disallowed' | 'accept' | 'hang'
const hits = [];

function disallowedAuthError() {
  const msg = 'disallowed_useragent';
  const proto = Buffer.concat([Buffer.from([0x0a, msg.length]), Buffer.from(msg)]);
  return proto.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const GOOGLE_AUTHORIZE =
  'https://accounts.google.com/o/oauth2/v2/auth?client_id=1.apps.googleusercontent.com&redirect_uri=' +
  encodeURIComponent(SITE + '/cb') +
  '&response_type=code&scope=openid&state=S1';
const GITHUB_AUTHORIZE = 'https://github.com/login/oauth/authorize?client_id=x&state=S2';

const html = (body) => new Response(`<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`, { headers: { 'content-type': 'text/html' } });
const redirect = (location) => new Response(null, { status: 302, headers: { location } });

async function fakeWeb(request) {
  const url = new URL(request.url);
  hits.push(url.href);
  if (url.hostname === 'accounts.google.com') {
    if (url.pathname.startsWith('/o/oauth2/')) {
      if (googleMode === 'hang') {
        await sleep(15000);
        return html('late');
      }
      if (googleMode === 'accept') return redirect(`${SITE}/cb?code=GOOGLE_ONCE&state=S1`);
      if (googleMode === 'disallowed') return redirect(`https://accounts.google.com/signin/oauth/error?authError=${disallowedAuthError()}&client_id=1`);
      return redirect('https://accounts.google.com/v3/signin/identifier?continue=' + encodeURIComponent(url.href) + '&flowName=GeneralOAuthFlow');
    }
    if (url.pathname.startsWith('/v3/signin/identifier')) {
      return html(`<script>setTimeout(() => location.href = '/v3/signin/rejected?continue=' + encodeURIComponent(new URLSearchParams(location.search).get('continue')), 50)</script>`);
    }
    return html('Couldn’t sign you in. This browser or app may not be secure.');
  }
  if (url.hostname === 'github.com') return redirect(`${SITE}/cb?code=GITHUB_ONCE&state=S2`);
  if (url.hostname === 'app.test') {
    switch (url.pathname) {
      case '/login-sametab':
        return html(`<script>setTimeout(() => location.href = ${JSON.stringify(GOOGLE_AUTHORIZE)}, 50)</script>`);
      case '/login-popup':
        return html(`<script>
          addEventListener('message', (e) => { if (e.origin === '${SITE}') document.title = 'GOT:' + e.data; });
          window.__popup = window.open(new URLSearchParams(location.search).get('to'), 'signin', 'width=500,height=600');
        </script>`);
      case '/open-link':
        return html(`<script>window.open('${SITE}/article')</script>`);
      case '/cb':
        return html(`<script>
          if (window.opener) { window.opener.postMessage('signed-in:' + new URLSearchParams(location.search).get('code'), '${SITE}'); window.close(); }
          else document.title = 'CALLBACK';
        </script>`);
      default:
        return html('page ' + url.pathname);
    }
  }
  return new Response('not found', { status: 404 });
}

// ------------------------------ app wiring (as in src/main/index.ts) ------------------------------
let mainWindow = null;
const notices = [];
const createdTabs = [];
const opened = [];
const copied = [];
let failOpen = false;

const controller = new AuthHandoffController({
  getMainWindow: () => mainWindow,
  openExternal: async (url) => {
    if (failOpen) throw new Error('no default browser');
    opened.push(url);
  },
  writeClipboard: (text) => copied.push(text),
});

app.on('web-contents-created', (_e, contents) => {
  controller.attach(contents);
  contents.setWindowOpenHandler((details) => {
    const decision = decideWindowOpen(details, { isAuthOrSecurityUrl, mainWindow, activeTab: { spaceId: 'space-work' } });
    if (decision.action === 'allow') return { action: 'allow', overrideBrowserWindowOptions: decision.overrideBrowserWindowOptions };
    createdTabs.push(decision.createTab);
    return { action: 'deny' };
  });
});

async function openTab(url) {
  mainWindow = new BrowserWindow({ show: false, webPreferences: { webviewTag: true, contextIsolation: false, nodeIntegration: true } });
  const origSend = mainWindow.webContents.send.bind(mainWindow.webContents);
  mainWindow.webContents.send = (channel, payload) => {
    if (channel === AUTH_HANDOFF_CHANNELS.required) notices.push(payload);
    return origSend(channel, payload);
  };
  await mainWindow.loadURL(
    'data:text/html,' +
      encodeURIComponent(`<webview id="tab" partition="${PARTITION}" allowpopups src="${url}" style="width:800px;height:600px"></webview>`)
  );
  for (let i = 0; i < 100; i++) {
    const wv = webContents.getAllWebContents().find((c) => c.getType() === 'webview' && !c.isDestroyed());
    if (wv) return wv;
    await sleep(50);
  }
  throw new Error('webview did not start');
}

function closeAll() {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.destroy();
  mainWindow = null;
}

async function waitFor(fn, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(50);
  }
  return null;
}

const popupWindows = () => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w !== mainWindow);

// ------------------------------ scenarios ------------------------------
const results = [];
async function scenario(name, fn) {
  notices.length = 0;
  createdTabs.length = 0;
  opened.length = 0;
  copied.length = 0;
  hits.length = 0;
  failOpen = false;
  let ok = false;
  let detail = '';
  try {
    detail = (await fn()) || '';
    ok = true;
  } catch (e) {
    detail = e && e.message ? e.message : String(e);
  }
  closeAll();
  await sleep(150);
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const cbHits = (code) => hits.filter((h) => h.includes(`code=${code}`)).length;

app.whenReady().then(async () => {
  session.fromPartition(PARTITION).protocol.handle('https', fakeWeb);

  await scenario('same-tab: Google refusal raises a handoff to the originating page', async () => {
    googleMode = 'reject';
    const tab = await openTab(`${SITE}/login-sametab`);
    const notice = await waitFor(() => notices[0]);
    assert(notice, 'no handoff notice');
    assert(notice.provider === 'google' && notice.reason === 'browser-not-secure' && !notice.isPopup, JSON.stringify(notice));
    assert(notice.siteHost === 'app.test', 'siteHost ' + notice.siteHost);
    assert(!('targetUrl' in notice), 'notice must not expose the URL to the renderer');
    await sleep(300);
    assert(notices.length === 1, 'duplicate notices: ' + notices.length);
    assert(tab.getURL().includes('/v3/signin/rejected'), 'tab should stay where it is: ' + tab.getURL());
    const res = await controller.open(notice.handoffId);
    assert(res.ok, JSON.stringify(res));
    assert(opened.length === 1 && opened[0] === `${SITE}/login-sametab`, 'opened ' + JSON.stringify(opened));
    const again = await controller.open(notice.handoffId);
    assert(!again.ok, 'handoff must be one-shot');
    return `opened ${opened[0]}`;
  });

  await scenario('same-tab: accepted Google sign-in redirects once to the callback, no handoff', async () => {
    googleMode = 'accept';
    const tab = await openTab(`${SITE}/login-sametab`);
    await waitFor(() => tab.getTitle() === 'CALLBACK');
    assert(tab.getTitle() === 'CALLBACK', 'callback not reached: ' + tab.getURL());
    await sleep(400);
    assert(cbHits('GOOGLE_ONCE') === 1, 'callback requested ' + cbHits('GOOGLE_ONCE') + ' times');
    assert(notices.length === 0, 'unexpected notice');
  });

  await scenario('popup: Google refusal closes the popup and hands off to the opener page', async () => {
    googleMode = 'reject';
    await openTab(`${SITE}/login-popup?to=${encodeURIComponent(GOOGLE_AUTHORIZE)}`);
    const notice = await waitFor(() => notices[0]);
    assert(notice && notice.isPopup && notice.reason === 'browser-not-secure', JSON.stringify(notice));
    const closed = await waitFor(() => popupWindows().length === 0, 3000);
    assert(closed, 'popup was left open');
    const res = await controller.open(notice.handoffId);
    assert(res.ok && opened[0] === `${SITE}/login-popup?to=${encodeURIComponent(GOOGLE_AUTHORIZE)}`, 'opened ' + JSON.stringify(opened));
    return `opened ${opened[0].slice(0, 40)}…`;
  });

  await scenario('popup: Error 400 disallowed_useragent is detected and handed off', async () => {
    googleMode = 'disallowed';
    await openTab(`${SITE}/login-popup?to=${encodeURIComponent(GOOGLE_AUTHORIZE)}`);
    const notice = await waitFor(() => notices[0]);
    assert(notice && notice.isPopup && notice.reason === 'disallowed-useragent', JSON.stringify(notice));
    assert(await waitFor(() => popupWindows().length === 0, 3000), 'popup was left open');
  });

  await scenario('popup: accepted Google sign-in keeps window.opener and completes on the site', async () => {
    googleMode = 'accept';
    const tab = await openTab(`${SITE}/login-popup?to=${encodeURIComponent(GOOGLE_AUTHORIZE)}`);
    const popup = await waitFor(() => popupWindows()[0]);
    assert(popup, 'no popup window');
    assert(popup.getTitle() !== 'Sign In', 'fixed popup title');
    await waitFor(() => tab.getTitle().startsWith('GOT:'));
    assert(tab.getTitle() === 'GOT:signed-in:GOOGLE_ONCE', 'opener did not receive the result: ' + tab.getTitle());
    assert(await waitFor(() => popupWindows().length === 0, 3000), 'popup did not close itself');
    assert(cbHits('GOOGLE_ONCE') === 1, 'callback requested ' + cbHits('GOOGLE_ONCE') + ' times');
    assert(notices.length === 0, 'unexpected notice');
  });

  await scenario('popup: GitHub sign-in is untouched (opener kept, no handoff)', async () => {
    const tab = await openTab(`${SITE}/login-popup?to=${encodeURIComponent(GITHUB_AUTHORIZE)}`);
    await waitFor(() => tab.getTitle().startsWith('GOT:'));
    assert(tab.getTitle() === 'GOT:signed-in:GITHUB_ONCE', 'opener did not receive the result: ' + tab.getTitle());
    assert(cbHits('GITHUB_ONCE') === 1, 'callback requested ' + cbHits('GITHUB_ONCE') + ' times');
    assert(notices.length === 0, 'unexpected notice');
  });

  await scenario('popup: user cancels (closes the popup) before Google answers — no handoff', async () => {
    googleMode = 'hang';
    await openTab(`${SITE}/login-popup?to=${encodeURIComponent(GOOGLE_AUTHORIZE)}`);
    const popup = await waitFor(() => popupWindows()[0]);
    assert(popup, 'no popup window');
    const popupId = popup.webContents.id;
    assert(controller.tracker.isPopup(popupId), 'popup not linked to its opener');
    await sleep(200);
    popup.close();
    await waitFor(() => popupWindows().length === 0, 3000);
    await sleep(200);
    assert(!controller.tracker.isPopup(popupId), 'tracker kept the cancelled popup');
    assert(notices.length === 0, 'unexpected notice');
  });

  await scenario('handoff failure: browser cannot open — error reported, copy link works, dismiss clears', async () => {
    googleMode = 'reject';
    await openTab(`${SITE}/login-sametab`);
    const notice = await waitFor(() => notices[0]);
    assert(notice, 'no notice');
    failOpen = true;
    const res = await controller.open(notice.handoffId);
    assert(!res.ok && /default browser/.test(res.error), JSON.stringify(res));
    const copy = controller.copy(notice.handoffId);
    assert(copy.ok && copied[0] === `${SITE}/login-sametab`, 'copy ' + JSON.stringify(copied));
    assert(controller.dismiss(notice.handoffId).ok, 'dismiss failed');
    assert(!controller.dismiss(notice.handoffId).ok, 'dismiss must be one-shot');
    assert(opened.length === 0, 'opened despite failure');
  });

  await scenario('IPC: only the browser UI may trigger a handoff, and only by id', async () => {
    googleMode = 'reject';
    await openTab(`${SITE}/login-sametab`);
    const notice = await waitFor(() => notices[0]);
    assert(notice, 'no notice');
    const handlers = {};
    controller.registerIpc({ handle: (ch, fn) => (handlers[ch] = fn) });
    const other = webContents.getAllWebContents().find((c) => c.getType() === 'webview');
    const denied = await handlers[AUTH_HANDOFF_CHANNELS.open]({ sender: other }, notice.handoffId);
    assert(!denied.ok, 'guest page was allowed to open');
    const rawUrl = await handlers[AUTH_HANDOFF_CHANNELS.open]({ sender: mainWindow.webContents }, 'https://evil.test/');
    assert(!rawUrl.ok, 'raw URL accepted');
    const fine = await handlers[AUTH_HANDOFF_CHANNELS.open]({ sender: mainWindow.webContents }, notice.handoffId);
    assert(fine.ok && opened.length === 1 && opened[0] === `${SITE}/login-sametab`, JSON.stringify(opened));
  });

  await scenario('normal browsing: window.open without features opens a Neutrino tab, not a popup', async () => {
    await openTab(`${SITE}/open-link`);
    const tab = await waitFor(() => createdTabs[0]);
    assert(tab && tab.url === `${SITE}/article` && tab.spaceId === 'space-work', JSON.stringify(createdTabs));
    assert(popupWindows().length === 0, 'unexpected popup');
    assert(notices.length === 0, 'unexpected notice');
  });

  const failed = results.filter((r) => !r.ok);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, 'authHandoffFlow.json'),
    JSON.stringify({ date: new Date().toISOString(), electron: process.versions.electron, userAgent: app.userAgentFallback, results }, null, 2)
  );
  console.log(`\n${results.length - failed.length}/${results.length} scenarios passed`);
  app.exit(failed.length === 0 ? 0 : 1);
});
