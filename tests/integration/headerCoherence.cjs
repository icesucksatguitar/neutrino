// Header coherence harness (bugfix spec google-signin-youtube-playback-fix, C_ua 1.4 to 1.6).
//
// Loads http://127.0.0.1:<port>/ in the persist:neutrino partition, records the request headers
// server-side and navigator.userAgent / navigator.userAgentData in the page, and checks that they
// agree with each other, report the real platform and the bundled Chromium version, carry a
// Neutrino product token and no forged "Google Chrome" brand.
//
// Run:   npx electron tests/integration/headerCoherence.cjs [--identity=original|fixed]
//   original (default): verbatim copy of the unfixed identity setup in src/main/index.ts
//   fixed:              uses dist-main/browserIdentity.js (task 3.1; run `npm run build:main` first)
// Exit 0 = all checks pass, 1 = at least one check failed. Writes tests/integration/out/headerCoherence.<identity>.json.
// Uses a throwaway userData directory, so the real Neutrino profile is never touched.

const { app, BrowserWindow, session } = require('electron');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

const identity = (process.argv.find((a) => a.startsWith('--identity=')) || '--identity=original').split('=')[1];
const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(__dirname, 'out');

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'neutrino-hdr-')));
app.commandLine.appendSwitch('no-sandbox');
// Keep running between probes (each probe destroys its window).
app.on('window-all-closed', () => {});

// ---- Verbatim copy of the unfixed identity (src/main/index.ts) ----
const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function applyOriginalIdentity(sess) {
  sess.setUserAgent(CHROME_USER_AGENT);
  sess.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };
    headers['User-Agent'] = CHROME_USER_AGENT;
    headers['Sec-CH-UA'] = '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"';
    headers['sec-ch-ua'] = '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"';
    headers['Sec-CH-UA-Mobile'] = '?0';
    headers['sec-ch-ua-mobile'] = '?0';
    headers['Sec-CH-UA-Platform'] = '"Windows"';
    headers['sec-ch-ua-platform'] = '"Windows"';
    callback({ requestHeaders: headers });
  });
}

function applyFixedIdentity(sess) {
  const mod = require(path.join(ROOT, 'dist-main', 'browserIdentity.js'));
  mod.applyBrowserIdentity(sess);
}

// app.userAgentFallback is set at module load, before app ready, as src/main/index.ts does.
// (Setting it after windows exist crashed the harness on Electron 33.)
if (identity === 'fixed') {
  app.userAgentFallback = require(path.join(ROOT, 'dist-main', 'browserIdentity.js')).getBrowserUserAgent();
} else {
  app.userAgentFallback = CHROME_USER_AGENT;
}
// -------------------------------------------------------------------

const PAGE = `<!doctype html><html><head><script src="/sub.js"></script></head><body>probe<script>
(async () => {
  const d = navigator.userAgentData;
  let high = null;
  try { high = d ? await d.getHighEntropyValues(['platform', 'platformVersion', 'fullVersionList', 'uaFullVersion']) : null; } catch (e) {}
  const payload = JSON.stringify({
    userAgent: navigator.userAgent,
    brands: d ? d.brands : null,
    mobile: d ? d.mobile : null,
    platform: d ? d.platform : null,
    high,
  });
  // GET with the payload in the query string (a POST body through the header rewrite stalled the load).
  await fetch('/report?d=' + encodeURIComponent(payload));
})();
</script></body></html>`;

function startServer() {
  const seen = { page: null, sub: null, report: null };
  let resolveReport;
  const reportReceived = new Promise((r) => (resolveReport = r));
  const server = http.createServer((req, res) => {
    if (req.url === '/') {
      seen.page = req.headers;
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(PAGE);
    } else if (req.url === '/sub.js') {
      seen.sub = req.headers;
      res.writeHead(200, { 'content-type': 'text/javascript' });
      res.end('/* subresource */');
    } else if (req.url.startsWith('/report?d=')) {
      try {
        seen.report = JSON.parse(decodeURIComponent(req.url.slice('/report?d='.length)));
      } catch (e) {
        console.error('bad report', e.message);
      }
      res.end('ok');
      resolveReport();
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, seen, reportReceived }))
  );
}

async function probe(partition, applyIdentity) {
  const { server, port, seen, reportReceived } = await startServer();
  const sess = session.fromPartition(partition);
  if (applyIdentity) applyIdentity(sess);
  const win = new BrowserWindow({ show: false, webPreferences: { partition, contextIsolation: true } });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => console.error(`[${partition}] did-fail-load ${code} ${desc} ${url}`));
  sess.webRequest.onErrorOccurred((d) => console.error(`[${partition}] request error ${d.error} ${d.url}`));
  win.loadURL(`http://127.0.0.1:${port}/`).catch((e) => console.error(`[${partition}] loadURL: ${e.message}`));
  await Promise.race([reportReceived, new Promise((r) => setTimeout(r, 10000))]);
  win.destroy();
  server.close();
  return seen;
}

const parseBrands = (h) =>
  h
    ? Array.from(String(h).matchAll(/"([^"]+)";v="([^"]+)"/g))
        .map((m) => `${m[1]}/${m[2]}`)
        .sort()
    : null;
const hintKeys = (headers) =>
  Object.keys(headers || {})
    .filter((k) => k.startsWith('sec-ch-ua'))
    .sort();
const EXPECTED_PLATFORM = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' }[process.platform];
const CHROME_SHAPED = /^Mozilla\/5\.0 \([^)]+\) AppleWebKit\/537\.36 \(KHTML, like Gecko\) Chrome\/[\d.]+ Safari\/537\.36$/;

app.whenReady().then(async () => {
  let exitCode = 1;
  try {
    // Control: a pristine partition with no identity changes shows what Chromium itself sends.
    // Control: a pristine partition with no identity changes shows what Chromium itself sends.
    const control = await probe(`hdr-control-${Date.now()}`, null);
    const seen = await probe('persist:neutrino', identity === 'fixed' ? applyFixedIdentity : applyOriginalIdentity);
    if (!seen.report) throw new Error('page report not received from persist:neutrino probe');

    const pageUA = seen.page && seen.page['user-agent'];
    const jsUA = seen.report && seen.report.userAgent;
    const headerBrands = parseBrands(seen.page && seen.page['sec-ch-ua']);
    const jsBrands = seen.report && seen.report.brands ? seen.report.brands.map((b) => `${b.brand}/${b.version}`).sort() : null;
    const headerPlatform = seen.page && seen.page['sec-ch-ua-platform'];

    const checks = {
      'User-Agent header equals navigator.userAgent': pageUA === jsUA,
      'UA contains Chrome/<process.versions.chrome>': Boolean(pageUA && pageUA.includes(`Chrome/${process.versions.chrome}`)),
      'UA is not Chrome-shaped': Boolean(pageUA) && !CHROME_SHAPED.test(pageUA),
      'UA has exactly one Neutrino/ token before Chrome/':
        Boolean(pageUA) && (pageUA.match(/Neutrino\//g) || []).length === 1 && pageUA.indexOf('Neutrino/') < pageUA.indexOf('Chrome/'),
      'UA has no Electron/ token': Boolean(pageUA) && !pageUA.includes('Electron/'),
      'Sec-CH-UA brands equal navigator.userAgentData.brands': JSON.stringify(headerBrands) === JSON.stringify(jsBrands),
      'Sec-CH-UA has no "Google Chrome" brand': !String((seen.page && seen.page['sec-ch-ua']) || '').includes('Google Chrome'),
      'Sec-CH-UA-Platform equals navigator.userAgentData.platform':
        headerPlatform === `"${seen.report && seen.report.platform}"`,
      'Sec-CH-UA-Platform reports the real OS': headerPlatform === `"${EXPECTED_PLATFORM}"`,
      'Subresource carries the same client-hint headers Chromium sends by itself':
        JSON.stringify(hintKeys(seen.sub)) === JSON.stringify(hintKeys(control.sub)),
    };

    const result = {
      identity,
      platform: process.platform,
      chromeVersion: process.versions.chrome,
      electronVersion: process.versions.electron,
      observed: {
        userAgentHeader: pageUA,
        navigatorUserAgent: jsUA,
        secChUaHeader: seen.page && seen.page['sec-ch-ua'],
        secChUaPlatformHeader: headerPlatform,
        navigatorBrands: jsBrands,
        navigatorPlatform: seen.report && seen.report.platform,
        subresourceHintKeys: hintKeys(seen.sub),
        controlSubresourceHintKeys: hintKeys(control.sub),
        controlUserAgent: control.page && control.page['user-agent'],
        controlSecChUa: control.page && control.page['sec-ch-ua'],
      },
      checks,
      failed: Object.entries(checks)
        .filter(([, v]) => !v)
        .map(([k]) => k),
    };
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, `headerCoherence.${identity}.json`), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    exitCode = result.failed.length === 0 ? 0 : 1;
  } catch (e) {
    console.error('Harness error:', e);
  }
  app.exit(exitCode);
});
