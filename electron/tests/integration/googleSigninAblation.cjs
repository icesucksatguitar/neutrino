// Live Google sign-in ablation (bugfix spec google-signin-youtube-playback-fix, C_auth 1.1 to 1.3).
//
// Method (after stablyai/orca#11518): fresh profile per run, type a disposable non-existent Gmail
// address into accounts.google.com, submit with webContents.sendInputEvent, classify the result.
//
// Arms (3 runs each, random order, one Electron process per run):
//   a: current UA (CHROME_USER_AGENT) + forged client hints (the unfixed onBeforeSendHeaders rewrite)
//   b: current UA + untouched hints (Chromium's own Sec-CH-UA*)
//   c: new UA (Neutrino/<ver> product token, real OS, real Chromium version) + forged hints
//   d: new UA + untouched hints
// Hypothesis holds if a and b are rejected and c and d are not.
//
// Run only with NEUTRINO_LIVE_TESTS=1:
//   $env:NEUTRINO_LIVE_TESTS='1'; node_modules\.bin\electron.cmd tests/integration/googleSigninAblation.cjs
// Results: tests/integration/out/googleSigninAblation.json. Needs network and a display.
// Each run uses a throwaway userData directory; no real account or profile is touched.

const { app, BrowserWindow, session } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(__dirname, 'out');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const argArm = (process.argv.find((a) => a.startsWith('--arm=')) || '').split('=')[1];
const argRun = (process.argv.find((a) => a.startsWith('--run=')) || '').split('=')[1];

// ---- Verbatim values from the unfixed src/main/index.ts ----
const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const FORGED_HINTS = {
  'Sec-CH-UA': '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
  'sec-ch-ua': '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
  'Sec-CH-UA-Mobile': '?0',
  'sec-ch-ua-mobile': '?0',
  'Sec-CH-UA-Platform': '"Windows"',
  'sec-ch-ua-platform': '"Windows"',
};
// -------------------------------------------------------------

// Design's new UA shape (src/main/userAgent.ts buildUserAgent, not yet implemented on unfixed code).
function designUserAgent(defaultUA) {
  const m = defaultUA.match(/\(([^)]+)\)/);
  const fallback = { win32: 'Windows NT 10.0; Win64; x64', darwin: 'Macintosh; Intel Mac OS X 10_15_7', linux: 'X11; Linux x86_64' };
  const osToken = m ? m[1] : fallback[process.platform];
  return `Mozilla/5.0 (${osToken}) AppleWebKit/537.36 (KHTML, like Gecko) Neutrino/${PKG.version} Chrome/${process.versions.chrome} Safari/537.36`;
}

// Design's isRejectionPage: accounts.google.com URL whose path contains /signin/rejected.
function isRejectionPage(url) {
  try {
    const u = new URL(url);
    return u.hostname === 'accounts.google.com' && u.pathname.includes('/signin/rejected');
  } catch {
    return false;
  }
}

const ARMS = {
  a: { ua: 'current', hints: 'forged' },
  b: { ua: 'current', hints: 'untouched' },
  c: { ua: 'new', hints: 'forged' },
  d: { ua: 'new', hints: 'untouched' },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Spawn one Electron run and resolve on process exit (not pipe close: Chromium helper processes can
// keep the inherited pipes open after the browser process has exited).
function runChild(args, timeoutMs) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on('exit', () => {
      clearTimeout(timer);
      setTimeout(() => resolve({ stdout, stderr }), 200);
    });
  });
}

// ------------------------------- orchestrator -------------------------------
async function orchestrate() {
  if (process.env.NEUTRINO_LIVE_TESTS !== '1') {
    console.log('Skipped: set NEUTRINO_LIVE_TESTS=1 to run the live Google sign-in ablation.');
    app.exit(0);
    return;
  }
  const schedule = [];
  for (const arm of Object.keys(ARMS)) for (let r = 1; r <= 3; r++) schedule.push({ arm, run: r });
  for (let i = schedule.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [schedule[i], schedule[j]] = [schedule[j], schedule[i]];
  }

  const results = [];
  for (const { arm, run } of schedule) {
    const { stdout, stderr } = await runChild([__filename, `--arm=${arm}`, `--run=${run}`], 120000);
    const line = stdout.split(/\r?\n/).find((l) => l.startsWith('RESULT '));
    const res = line ? JSON.parse(line.slice(7)) : { arm, run, outcome: 'harness-error', stderr: stderr.slice(-500) };
    console.log(JSON.stringify(res));
    results.push(res);
  }

  const summary = {};
  for (const arm of Object.keys(ARMS)) {
    const rs = results.filter((r) => r.arm === arm);
    summary[arm] = { ...ARMS[arm], runs: rs.length, rejected: rs.filter((r) => r.rejected).length, outcomes: rs.map((r) => r.outcome) };
  }
  const hypothesisHolds =
    summary.a.rejected === summary.a.runs && summary.b.rejected === summary.b.runs && summary.c.rejected === 0 && summary.d.rejected === 0;
  const out = { date: new Date().toISOString(), platform: process.platform, chrome: process.versions.chrome, summary, hypothesisHolds, results };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'googleSigninAblation.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ summary, hypothesisHolds }, null, 2));
  app.exit(0);
}

// --------------------------------- one run ---------------------------------
async function runOne(arm, run) {
  const cfg = ARMS[arm];
  const ua = cfg.ua === 'current' ? CHROME_USER_AGENT : designUserAgent(DEFAULT_UA);
  const partition = `persist:ablation-${arm}-${run}`;
  const sess = session.fromPartition(partition);
  sess.setUserAgent(ua);
  if (cfg.hints === 'forged') {
    sess.webRequest.onBeforeSendHeaders((details, callback) => {
      const headers = { ...details.requestHeaders, 'User-Agent': ua, ...FORGED_HINTS };
      callback({ requestHeaders: headers });
    });
  }

  const win = new BrowserWindow({ width: 1000, height: 800, show: true, webPreferences: { partition, contextIsolation: true } });
  const result = { arm, run, ua, hints: cfg.hints, outcome: 'timeout', rejected: false, finalUrl: '', detail: '' };
  try {
    win.loadURL('https://accounts.google.com/').catch(() => {});

    // Wait for the identifier field.
    const FIELD = `document.querySelector('#identifierId, input[name=identifier], input[type=email]')`;
    let ready = false;
    let lastErr = '';
    for (let i = 0; i < 60 && !ready; i++) {
      await sleep(500);
      ready = await win.webContents.executeJavaScript(`Boolean(${FIELD})`).catch((e) => {
        lastErr = String(e && e.message);
        return false;
      });
    }
    if (!ready) {
      const diag = await win.webContents
        .executeJavaScript(
          `JSON.stringify({ title: document.title, inputs: Array.from(document.querySelectorAll('input')).map((i) => i.type + '#' + i.id + '/' + i.name), text: (document.body ? document.body.innerText : '').slice(0, 300) })`
        )
        .catch((e) => 'diag failed: ' + (e && e.message));
      result.outcome = 'no-identifier-field';
      result.finalUrl = win.webContents.getURL();
      result.detail = `${diag} lastErr=${lastErr}`;
      return result;
    }
    await sleep(800 + crypto.randomInt(700));
    await win.webContents.executeJavaScript(`${FIELD}.focus()`);
    win.focus();

    const email = `neutrino.ablation.${crypto.randomBytes(6).toString('hex')}@gmail.com`;
    for (const ch of email) {
      win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
      await sleep(60 + crypto.randomInt(80));
    }
    await sleep(400);
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
    win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });

    const startUrl = win.webContents.getURL();
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      const url = win.webContents.getURL();
      const text = await win.webContents.executeJavaScript(`document.body ? document.body.innerText : ''`).catch(() => '');
      if (isRejectionPage(url) || /may not be secure/i.test(text)) {
        Object.assign(result, { outcome: 'rejected', rejected: true, finalUrl: url });
        return result;
      }
      if (/couldn.t find (your google|this) account/i.test(text)) {
        Object.assign(result, { outcome: 'account-not-found', finalUrl: url });
        return result;
      }
      if (url !== startUrl && /\/challenge\/|\/pwd|recaptcha|\/signin\/v2\/challenge/i.test(url)) {
        Object.assign(result, { outcome: 'challenge', finalUrl: url });
        return result;
      }
    }
    result.finalUrl = win.webContents.getURL();
    const diag = await win.webContents
      .executeJavaScript(
        `JSON.stringify({ field: (${FIELD} || {}).value || '', captcha: Boolean(document.querySelector('img#captchaimg, [id*=captcha], iframe[src*=recaptcha]')), text: (document.body ? document.body.innerText : '').replace(/\\s+/g, ' ').slice(0, 400) })`
      )
      .catch((e) => 'diag failed: ' + (e && e.message));
    result.detail = `no classified outcome within 20 s after submit; page=${diag}`;
    return result;
  } finally {
    win.destroy();
  }
}

// --------------------------------- entry ---------------------------------
let DEFAULT_UA = '';
if (argArm) {
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'neutrino-gab-')));
  DEFAULT_UA = app.userAgentFallback; // Electron default, captured before any override
  app.userAgentFallback = ARMS[argArm].ua === 'current' ? CHROME_USER_AGENT : designUserAgent(DEFAULT_UA);
  app.on('window-all-closed', () => {});
  app.whenReady().then(async () => {
    let res;
    try {
      res = await runOne(argArm, Number(argRun));
    } catch (e) {
      res = { arm: argArm, run: Number(argRun), outcome: 'harness-error', detail: String(e && e.message) };
    }
    console.log('RESULT ' + JSON.stringify(res));
    setTimeout(() => process.exit(0), 1000);
    app.exit(0);
  });
} else {
  app.whenReady().then(orchestrate);
}
