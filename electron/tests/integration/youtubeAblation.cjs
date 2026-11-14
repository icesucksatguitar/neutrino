// Live YouTube playback ablation (bugfix spec google-signin-youtube-playback-fix, C_yt 1.8 to 1.12).
//
// Reproduces what the unfixed app does to a YouTube page (force dark + shields on) in a plain
// BrowserWindow, with both the main-process dom-ready injection and the renderer-side
// (BrowserViewport) injections, then removes one suspect at a time:
//   baseline             all five suspects on (unfixed behavior)
//   no-ad-skipper        neither ad skipper copy is injected (main-process 250 ms one, renderer inline one)
//   no-dialog-rule       tp-yt-paper-dialog:has(#feedback) is removed from the cosmetic CSS
//   ptracking-unblocked  /ptracking requests pass shields
//   no-darkreader        DarkReader is not injected by either path
//   no-gpu-switches      the forced GPU switches are not appended
// Each arm runs in its own Electron process (GPU switches are process-wide) with a throwaway profile.
// For each watch page it records, over 30 s: currentTime progress, playbackRate after any ad,
// hidden dialogs while the video is paused, blocked youtube.com / googlevideo.com requests,
// long-task time and whether DarkReader is present.
//
// Run only with NEUTRINO_LIVE_TESTS=1, after `npm run build:main` (uses dist-main/adblock/engine.js):
//   $env:NEUTRINO_LIVE_TESTS='1'; node_modules\.bin\electron.cmd tests/integration/youtubeAblation.cjs
// Optional: --arms=baseline,no-ad-skipper  --videos=dQw4w9WgXcQ,...  --seconds=30
// Results: tests/integration/out/youtubeAblation.json. Needs network and a display.

const { app, BrowserWindow, session, nativeTheme } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(__dirname, 'out');
const getArg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || '').split('=').slice(1).join('=');

const ALL_ARMS = ['baseline', 'no-ad-skipper', 'no-dialog-rule', 'ptracking-unblocked', 'no-darkreader', 'no-gpu-switches'];
const DEFAULT_VIDEOS = ['dQw4w9WgXcQ', 'kJQP7kiw5Fk', '9bZkp7q19f0'];
const SECONDS = Number(getArg('seconds') || 30);

// ---- Verbatim values from the unfixed src/main/index.ts ----
const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const STARTUP_SWITCHES = [
  ['high-dpi-support', '1'],
  ['ignore-gpu-blocklist'],
  ['enable-gpu-rasterization'],
  ['enable-zero-copy'],
  ['enable-native-gpu-memory-buffers'],
  ['enable-accelerated-video-decode'],
  ['enable-accelerated-2d-canvas'],
  ['num-raster-threads', '4'],
  ['enable-quic'],
  ['enable-fast-unload'],
  ['disable-blink-features', 'AutomationControlled'],
];
const FORCED_GPU = new Set(['ignore-gpu-blocklist', 'enable-gpu-rasterization', 'enable-zero-copy', 'enable-native-gpu-memory-buffers', 'num-raster-threads']);

function isGoogleAuthUrl(url) {
  if (!url) return false;
  return (
    url.includes('accounts.google.com') ||
    url.includes('myaccount.google.com') ||
    url.includes('accounts.youtube.com') ||
    url.includes('oauth2.googleapis.com') ||
    url.includes('apis.google.com/oauth')
  );
}
function isAuthOrSecurityUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    isGoogleAuthUrl(url) ||
    lower.includes('recaptcha') || lower.includes('gstatic.com') || lower.includes('turnstile') ||
    lower.includes('challenges.cloudflare.com') || lower.includes('hcaptcha') || lower.includes('appleid.apple.com') ||
    lower.includes('github.com/login') || lower.includes('api.github.com') || lower.includes('login.microsoftonline.com') ||
    lower.includes('login.live.com') || lower.includes('msftauth.net') || lower.includes('identitytoolkit.googleapis.com') ||
    lower.includes('securetoken.googleapis.com') || lower.includes('auth0.com') || lower.includes('clerk.') ||
    lower.includes('supabase.co') || lower.includes('penpencil.co') || lower.includes('pw.live') ||
    lower.includes('/oauth') || lower.includes('/auth') || lower.includes('/signin') || lower.includes('/signup') ||
    lower.includes('/login') || lower.includes('/otp') || lower.includes('/token')
  );
}
// -------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Spawn one Electron arm and resolve on process exit (Chromium helpers can hold the pipes open).
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
    console.log('Skipped: set NEUTRINO_LIVE_TESTS=1 to run the live YouTube ablation.');
    app.exit(0);
    return;
  }
  if (!fs.existsSync(path.join(ROOT, 'dist-main', 'adblock', 'engine.js'))) {
    console.error('dist-main/adblock/engine.js not found. Run `npm run build:main` first.');
    app.exit(2);
    return;
  }
  const arms = (getArg('arms') || ALL_ARMS.join(',')).split(',');
  const videos = (getArg('videos') || DEFAULT_VIDEOS.join(',')).split(',');
  const results = [];
  for (const arm of arms) {
    const { stdout, stderr } = await runChild(
      [__filename, `--arm=${arm}`, `--videos=${videos.join(',')}`, `--seconds=${SECONDS}`],
      (SECONDS + 60) * 1000 * videos.length + 60000
    );
    const line = stdout.split(/\r?\n/).find((l) => l.startsWith('RESULT '));
    const res = line ? JSON.parse(line.slice(7)) : { arm, error: 'harness-error', stderr: stderr.slice(-800) };
    console.log(JSON.stringify(summarizeArm(res)));
    results.push(res);
  }
  const out = { date: new Date().toISOString(), platform: process.platform, chrome: process.versions.chrome, seconds: SECONDS, videos, arms: results.map(summarizeArm), raw: results };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'youtubeAblation.json'), JSON.stringify(out, null, 2));
  app.exit(0);
}

function summarizeArm(res) {
  if (!res.videos) return res;
  return {
    arm: res.arm,
    lifecycle: res.lifecycle,
    videos: res.videos.map((v) => (v.error ? { id: v.id, error: v.error } : {
      id: v.id,
      playbackOk: v.playbackOk,
      contentProgressS: v.contentProgressS,
      adSamples: v.adSamples,
      maxContentRate: v.maxContentRate,
      rateAfterAd: v.rateAfterAd,
      bigJumps: v.bigJumps,
      pausedSamples: v.pausedSamples,
      hiddenDialogsWhilePaused: v.hiddenDialogsWhilePaused,
      blockedYouTube: v.blockedYouTube.length,
      blockedGooglevideo: v.blockedGooglevideo.length,
      longTaskMs: v.longTaskMs,
      darkReaderPresent: v.darkReaderPresent,
      darkReaderStyles: v.darkReaderStyles,
      skipperInjected: v.skipperInjected,
      finalUrl: v.finalUrl,
      note: v.note,
    })),
  };
}

// --------------------------------- one arm ---------------------------------
async function runArm(arm, videos) {
  const { BraveShieldEngine } = require(path.join(ROOT, 'dist-main', 'adblock', 'engine.js'));
  const engine = new BraveShieldEngine();
  const darkReaderCode = fs.readFileSync(path.join(ROOT, 'node_modules', 'darkreader', 'darkreader.js'), 'utf8');
  nativeTheme.themeSource = 'dark';

  let css = engine.getCosmeticFilterCSS();
  if (arm === 'no-dialog-rule') css = css.replace('tp-yt-paper-dialog:has(#feedback),', '');

  const partition = `persist:yt-${arm}`;
  const sess = session.fromPartition(partition);
  sess.setUserAgent(CHROME_USER_AGENT);
  let blocked = [];
  sess.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    const url = details.url;
    if (url.startsWith('file://') || url.startsWith('devtools://') || url.startsWith('chrome-extension://')) return callback({ cancel: false });
    if (isAuthOrSecurityUrl(url)) return callback({ cancel: false });
    if (arm === 'ptracking-unblocked' && url.toLowerCase().includes('/ptracking')) return callback({ cancel: false });
    const decision = engine.checkUrl(url);
    if (decision.blocked) {
      blocked.push({ url: url.slice(0, 160), rule: decision.rule });
      return callback({ cancel: true });
    }
    callback({ cancel: false });
  });
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

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: true,
    webPreferences: { partition, contextIsolation: true, autoplayPolicy: 'no-user-gesture-required' },
  });
  const wc = win.webContents;
  const lifecycle = [];
  win.on('close', () => lifecycle.push('window close event'));
  wc.on('render-process-gone', (_e, d) => lifecycle.push(`render-process-gone: ${d.reason}`));
  wc.on('unresponsive', () => lifecycle.push('renderer unresponsive'));
  app.on('child-process-gone', (_e, d) => lifecycle.push(`child-process-gone: ${d.type} ${d.reason}`));

  // Same dom-ready injection as the unfixed main process (stubs, cosmetic CSS, ad skipper, DarkReader).
  wc.on('dom-ready', async () => {
    try {
      await wc.executeJavaScript(`
        try {
          window.__neutrino_longtask_ms = 0;
          new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__neutrino_longtask_ms += e.duration; })
            .observe({ type: 'longtask', buffered: true });
        } catch (e) {}
        try {
          if (!window.dataLayer) window.dataLayer = [];
          if (!window.google_tag_manager) window.google_tag_manager = {};
          if (!window.fbq) { window.fbq = function() { (window.fbq.q = window.fbq.q || []).push(arguments); }; }
        } catch(e) {}
      `).catch(() => {});
      await wc.insertCSS(css);
      if (wc.getURL().includes('youtube.com') && arm !== 'no-ad-skipper') {
        await wc.executeJavaScript(engine.getYouTubeAdSkipperScript());
      }
      if (arm !== 'no-darkreader') {
        const url = wc.getURL();
        if (url && !url.startsWith('about:') && !isAuthOrSecurityUrl(url)) {
          const hasLib = await wc.executeJavaScript(`typeof window.DarkReader !== 'undefined'`).catch(() => false);
          if (!hasLib) await wc.executeJavaScript(darkReaderCode).catch(() => {});
          await wc.executeJavaScript(`
            try {
              if (window.DarkReader) {
                DarkReader.setFetchMethod(window.fetch);
                DarkReader.enable({ brightness: 100, contrast: 95, sepia: 0 });
                window.__neutrino_darkreader_active = true;
              }
            } catch(e) {}
          `).catch(() => {});
        }
      }
    } catch {}
  });

  // Renderer-side injections, verbatim from BrowserViewport.tsx handleDomReady:
  // syncDarkThemeForTab (dark mode on) and injectAdblocking (the inline ad skipper).
  // Note: the main-process skipper above throws a SyntaxError in the page (it contains TypeScript
  // `as HTMLElement` casts inside the JS string), which also aborts the main-process DarkReader step.
  // In the real app these renderer copies are therefore the ones that actually run on YouTube.
  wc.on('dom-ready', async () => {
    const u = wc.getURL() || '';
    if (arm !== 'no-darkreader' && u && !u.startsWith('neutrino://') && !u.startsWith('about:')) {
      try {
        const checkRes = await wc.executeJavaScript(`
          (() => {
            if (window.__neutrino_darkreader_active) return 'ACTIVE';
            return typeof window.DarkReader !== 'undefined' ? 'LOADED' : 'NONE';
          })()
        `).catch(() => 'NONE');
        if (checkRes !== 'ACTIVE') {
          await wc.executeJavaScript(`
            (() => {
              try {
                document.documentElement.style.colorScheme = 'dark';
                if (document.body) document.body.style.colorScheme = 'dark';
              } catch(e) {}
            })();
          `).catch(() => {});
          if (checkRes === 'NONE') await wc.executeJavaScript(darkReaderCode).catch(() => {});
          await wc.executeJavaScript(`
            (() => {
              try {
                if (window.DarkReader) {
                  DarkReader.setFetchMethod(window.fetch);
                  DarkReader.enable({ brightness: 100, contrast: 95, sepia: 0 });
                  window.__neutrino_darkreader_active = true;
                }
              } catch(e) {}
            })();
          `).catch(() => {});
        }
      } catch {}
    }
    if (arm !== 'no-ad-skipper' && u.includes('youtube.com')) {
      wc.executeJavaScript(`
        (() => {
          if (window.__neutrino_ad_skipper_injected) return;
          window.__neutrino_ad_skipper_injected = true;
          const skip = () => {
            try {
              const v = document.querySelector('video');
              const ad = document.querySelector('.ad-showing, .ad-interrupting');
              if (ad && v && !isNaN(v.duration) && isFinite(v.duration)) {
                v.currentTime = v.duration;
                v.playbackRate = 16.0;
              }
              const btns = document.querySelectorAll('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, button.ytp-ad-skip-button, .ytp-ad-overlay-close-button');
              btns.forEach((b) => b.click());
              const overlays = document.querySelectorAll('.ytp-ad-overlay-container, ytd-ad-slot-renderer, #player-ads');
              overlays.forEach((el) => { el.style.display = 'none'; });
            } catch(e) {}
          };
          const obs = new MutationObserver(() => requestAnimationFrame(skip));
          obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
          setInterval(skip, 2000);
        })();
      `).catch(() => {});
    }
  });

  const SAMPLE = `(() => {
    const v = document.querySelector('video');
    const p = document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
    const dialogs = Array.from(document.querySelectorAll('tp-yt-paper-dialog'));
    const hidden = dialogs.filter((d) => getComputedStyle(d).display === 'none' && d.querySelector('#feedback')).length;
    return {
      hasVideo: Boolean(v),
      t: v ? v.currentTime : null,
      duration: v ? v.duration : null,
      paused: v ? v.paused : null,
      rate: v ? v.playbackRate : null,
      muted: v ? v.muted : null,
      ad: Boolean(p && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting'))),
      hiddenDialogs: hidden,
      longTaskMs: window.__neutrino_longtask_ms || 0,
      darkReader: typeof window.DarkReader !== 'undefined',
      darkReaderActiveFlag: Boolean(window.__neutrino_darkreader_active),
      skipperInjected: Boolean(window.__neutrino_ad_skipper_injected),
      darkReaderStyles: document.querySelectorAll('style.darkreader').length,
      amdDefine: typeof window.define === 'function' && Boolean(window.define.amd),
    };
  })()`;

  const out = [];
  for (const id of videos) {
    blocked = [];
    wc.loadURL(`https://www.youtube.com/watch?v=${id}`).catch(() => {});
    // Wait for the video element (up to 20 s), then nudge play once like a user would.
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      const has = await wc.executeJavaScript(`Boolean(document.querySelector('video'))`).catch(() => false);
      if (has) break;
    }
    await wc.executeJavaScript(`(() => { const v = document.querySelector('video'); if (v && v.paused) v.play().catch(() => {}); })()`).catch(() => {});

    const samples = [];
    for (let s = 0; s < SECONDS; s++) {
      await sleep(1000);
      if (wc.isDestroyed()) break;
      samples.push(await wc.executeJavaScript(SAMPLE).catch(() => ({ hasVideo: false })));
    }
    if (wc.isDestroyed()) {
      out.push({ id, error: `window destroyed during sampling (${lifecycle.join('; ') || 'no close/crash event seen'})`, samples });
      break;
    }

    let contentProgressS = 0;
    let bigJumps = 0;
    let maxContentRate = 0;
    let rateAfterAd = null;
    let sawAd = false;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      if (!a.hasVideo || !b.hasVideo || a.t == null || b.t == null) continue;
      if (b.ad) sawAd = true;
      if (!b.ad) {
        if (b.rate != null) maxContentRate = Math.max(maxContentRate, b.rate);
        if (sawAd && rateAfterAd === null) rateAfterAd = b.rate;
        const dt = b.t - a.t;
        if (!a.ad && dt > 0 && dt < 5) contentProgressS += dt;
        // Content-to-content jumps only: an ad-to-content transition switches media and is not a seek.
        if (!a.ad && Math.abs(dt) >= 5) bigJumps++;
      }
    }
    const pausedSamples = samples.filter((x) => x.paused).length;
    const last = samples[samples.length - 1] || {};
    const finalUrl = wc.getURL();
    out.push({
      id,
      finalUrl,
      note: /consent\./.test(finalUrl) ? 'consent page shown' : '',
      playbackOk: contentProgressS >= SECONDS * 0.4 && maxContentRate <= 2 && bigJumps === 0,
      contentProgressS: Math.round(contentProgressS * 10) / 10,
      adSamples: samples.filter((x) => x.ad).length,
      maxContentRate,
      rateAfterAd,
      bigJumps,
      pausedSamples,
      hiddenDialogsWhilePaused: samples.filter((x) => x.paused && x.hiddenDialogs > 0).length,
      blockedYouTube: blocked.filter((b) => /youtube\.com/.test(new URL(b.url).hostname)),
      blockedGooglevideo: blocked.filter((b) => /googlevideo\.com/.test(new URL(b.url).hostname)),
      longTaskMs: Math.round(last.longTaskMs || 0),
      darkReaderPresent: Boolean(last.darkReader),
      darkReaderStyles: last.darkReaderStyles || 0,
      skipperInjected: Boolean(last.skipperInjected),
      amdDefine: Boolean(last.amdDefine),
      samples,
    });
  }
  if (!win.isDestroyed()) win.destroy();
  return { arm, gpuSwitches: arm === 'no-gpu-switches' ? 'removed' : 'forced', lifecycle, videos: out };
}

// --------------------------------- entry ---------------------------------
const argArm = getArg('arm');
if (argArm) {
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'neutrino-yta-')));
  for (const [name, value] of STARTUP_SWITCHES) {
    if (argArm === 'no-gpu-switches' && FORCED_GPU.has(name)) continue;
    if (value !== undefined) app.commandLine.appendSwitch(name, value);
    else app.commandLine.appendSwitch(name);
  }
  app.userAgentFallback = CHROME_USER_AGENT;
  app.on('window-all-closed', () => {});
  app.whenReady().then(async () => {
    let res;
    try {
      res = await runArm(argArm, getArg('videos').split(','));
    } catch (e) {
      res = { arm: argArm, error: String(e && e.stack) };
    }
    console.log('RESULT ' + JSON.stringify(res));
    setTimeout(() => process.exit(0), 1000);
    app.exit(0);
  });
} else {
  app.whenReady().then(orchestrate);
}
