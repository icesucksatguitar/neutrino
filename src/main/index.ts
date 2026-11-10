import { app, BrowserWindow, ipcMain, session, screen, webContents, nativeTheme, WebContents } from 'electron';
import path from 'path';
import fs from 'fs';
import { BraveShieldEngine } from './adblock/engine';
import { ZenResourceManager } from './resourceManager';
import { McpServer } from './mcp/server';
import { LocalStorageManager } from './sync/storage';
import { BrowserManager } from './browserManager';
import { isGoogleAuthUrl, isAuthOrSecurityUrl } from './urlClassifier';
import { BrowserSettings, normalizeSettings } from './settings';
import { shouldInjectDarkReader, DARK_READER_ENABLE_SCRIPT, DARK_READER_DISABLE_SCRIPT } from './darkMode';

// Maximum performance and hardware acceleration flags (stable for Windows D3D11/Vulkan video)
app.commandLine.appendSwitch('high-dpi-support', '1');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-accelerated-video-decode');
app.commandLine.appendSwitch('enable-accelerated-2d-canvas');
app.commandLine.appendSwitch('num-raster-threads', '4');
app.commandLine.appendSwitch('enable-quic');
app.commandLine.appendSwitch('enable-fast-unload');
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

// Set native theme source to dark by default
nativeTheme.themeSource = 'dark';
let isDarkMode = true;

// Preload DarkReader script into memory for universal website dark mode
let darkReaderCode = '';
try {
  const possiblePaths = [
    path.join(__dirname, '..', 'node_modules', 'darkreader', 'darkreader.js'),
    path.join(app.getAppPath(), 'node_modules', 'darkreader', 'darkreader.js'),
    path.join(__dirname, 'darkreader.js'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      darkReaderCode = fs.readFileSync(p, 'utf8');
      break;
    }
  }
} catch (e) {
  console.error('Failed to load darkreader.js:', e);
}

let mainWindow: BrowserWindow | null = null;

// Initialize Core Subsystems
const adblockEngine = new BraveShieldEngine();
const resourceManager = new ZenResourceManager();
const mcpServer = new McpServer();
const storage = new LocalStorageManager();
const browserManager = new BrowserManager(adblockEngine, resourceManager, mcpServer, storage);

mcpServer.start();

<<<<<<< HEAD
// Browser settings: load, fill defaults, and apply the parts owned by the main process.
let settings: BrowserSettings = normalizeSettings(storage.loadState().settings);
adblockEngine.setEnabled(settings.adblockEnabled);
resourceManager.setAutoSleepEnabled(settings.zenSleepEnabled);

function getWebviewContents(): WebContents[] {
  return webContents.getAllWebContents().filter((wc) => !wc.isDestroyed() && wc.getType() === 'webview');
}

/**
 * The only code that loads DarkReader into webviews. Enables it on eligible pages while dark
 * mode is on, and disables it everywhere else without reloading the page.
 */
async function applyDarkMode(wc: WebContents): Promise<void> {
  if (wc.isDestroyed()) return;
  const run = (code: string) => wc.executeJavaScript(code).catch(() => undefined);

  let url = '';
  try {
    url = wc.getURL();
  } catch {
    return;
  }
  const eligible = shouldInjectDarkReader(url, settings.darkModeExclusions);

  if (isDarkMode && darkReaderCode && eligible) {
    await run(`
      try {
        document.documentElement.style.colorScheme = 'dark';
        if (document.body) document.body.style.colorScheme = 'dark';
      } catch (e) {}
    `);
    const alreadyActive = await run(`Boolean(window.__neutrino_darkreader_active)`);
    if (alreadyActive === true) return;
    const hasLib = await run(`typeof window.DarkReader !== 'undefined'`);
    if (hasLib !== true) {
      await run(darkReaderCode);
    }
    await run(DARK_READER_ENABLE_SCRIPT);
    return;
  }

  const hasLib = await run(`typeof window.DarkReader !== 'undefined'`);
  if (hasLib === true) {
    await run(DARK_READER_DISABLE_SCRIPT);
  }
  // Excluded pages keep their own look and follow prefers-color-scheme from nativeTheme.
  if (!isDarkMode && eligible) {
    await run(`
      try {
        document.documentElement.style.colorScheme = 'light';
        if (document.body) document.body.style.colorScheme = 'light';
      } catch (e) {}
    `);
  }
}

async function applyDarkModeToAllWebviews(): Promise<void> {
  await Promise.all(getWebviewContents().map((wc) => applyDarkMode(wc).catch(() => undefined)));
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

function applySettings(prev: BrowserSettings, next: BrowserSettings) {
  if (prev.adblockEnabled !== next.adblockEnabled) {
    adblockEngine.setEnabled(next.adblockEnabled);
  }
  if (prev.zenSleepEnabled !== next.zenSleepEnabled) {
    resourceManager.setAutoSleepEnabled(next.zenSleepEnabled);
  }
  if (!sameList(prev.darkModeExclusions, next.darkModeExclusions)) {
    void applyDarkModeToAllWebviews();
  }
}

/** Merges a patch from the renderer, re-validates it, applies, saves and broadcasts the result. */
function updateSettings(patch: unknown): BrowserSettings {
  const safePatch = patch !== null && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
  const prev = settings;
  const next = normalizeSettings({ ...prev, ...safePatch });
  settings = next;
  applySettings(prev, next);
  storage.saveSettings(next);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('neutrino:settings-updated', next);
  }
  return next;
}

=======
const chromeVersion = process.versions.chrome || '130.0.0.0';
const chromeMajor = chromeVersion.split('.')[0] || '130';

// Standard pure Chrome User Agent with no "Electron" or app-name tokens
>>>>>>> 2f38679bbeb5a2c4a02d317260450f3d27f772f1
export const CHROME_USER_AGENT =
`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;

<<<<<<< HEAD
// Re-exported so existing imports from index (e.g. tests requiring dist-main/index.js) keep working.
export { isGoogleAuthUrl, isAuthOrSecurityUrl };
=======
export function isGoogleAuthUrl(url: string): boolean {
  if (!url) return false;
  return (
    url.includes('accounts.google.com') ||
    url.includes('myaccount.google.com') ||
    url.includes('accounts.youtube.com') ||
    url.includes('oauth2.googleapis.com') ||
    url.includes('apis.google.com/oauth')
  );
}

export function isMediaStreamingUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    lower.includes('googlevideo.com') ||
    lower.includes('videoplayback') ||
    lower.includes('youtubei/v1/player')
  );
}

export function isAuthOrSecurityUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    isGoogleAuthUrl(url) ||
    lower.includes('recaptcha') ||
    lower.includes('gstatic.com') ||
    lower.includes('turnstile') ||
    lower.includes('challenges.cloudflare.com') ||
    lower.includes('hcaptcha') ||
    lower.includes('appleid.apple.com') ||
    lower.includes('github.com/login') ||
    lower.includes('api.github.com') ||
    lower.includes('login.microsoftonline.com') ||
    lower.includes('login.live.com') ||
    lower.includes('msftauth.net') ||
    lower.includes('identitytoolkit.googleapis.com') ||
    lower.includes('securetoken.googleapis.com') ||
    lower.includes('auth0.com') ||
    lower.includes('clerk.') ||
    lower.includes('supabase.co') ||
    lower.includes('penpencil.co') ||
    lower.includes('pw.live') ||
    lower.includes('/oauth') ||
    lower.includes('/auth') ||
    lower.includes('/signin') ||
    lower.includes('/signup') ||
    lower.includes('/login') ||
    lower.includes('/otp') ||
    lower.includes('/token')
  );
}
>>>>>>> 2f38679bbeb5a2c4a02d317260450f3d27f772f1

// 1. Set global fallback user agent to pure Chrome
app.userAgentFallback = CHROME_USER_AGENT;

function setupNetworkInterception() {
  const currentSession = session.defaultSession;
  const neutrinoSession = session.fromPartition('persist:neutrino');

  // Enforce standard clean desktop Chrome user agent across all sessions
  currentSession.setUserAgent(CHROME_USER_AGENT);
  neutrinoSession.setUserAgent(CHROME_USER_AGENT);

  // 5. Clear partition storage once after the change
  neutrinoSession.clearStorageData().catch(() => { });

  const applyInterception = (sess: any) => {
    try {
      sess.setUserAgent(CHROME_USER_AGENT);
    } catch { }

    // Intercept web requests with Brave-grade ad & tracker blocker
    sess.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details: any, callback: any) => {
      const url = details.url;

      // Allow internal UI and dev tools
      if (url.startsWith('file://') || url.startsWith('devtools://') || url.startsWith('chrome-extension://')) {
        callback({ cancel: false });
        return;
      }

        // Never block YouTube video streams, playback feeds, authentication, CAPTCHA, or verification endpoints
        if (isAuthOrSecurityUrl(url) || isMediaStreamingUrl(url)) {
          callback({ cancel: false });
          return;
        }

        const decision = adblockEngine.checkUrl(url);
        if (decision.blocked) {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('neutrino:tracker-blocked', {
              url,
              domain: decision.domain,
              category: decision.category,
              rule: decision.rule,
            });
          }
          callback({ cancel: true });
          return;
        }

        callback({ cancel: false });
      });

    // 2. Override sec-ch-ua, sec-ch-ua-mobile and sec-ch-ua-platform in webRequest.onBeforeSendHeaders
    sess.webRequest.onBeforeSendHeaders((details: any, callback: any) => {
      const headers = { ...details.requestHeaders };

      const secChUa = `"Chromium";v="${chromeMajor}", "Google Chrome";v="${chromeMajor}", "Not?A_Brand";v="99"`;
      headers['User-Agent'] = CHROME_USER_AGENT;
      headers['user-agent'] = CHROME_USER_AGENT;
      headers['Sec-CH-UA'] = secChUa;
      headers['sec-ch-ua'] = secChUa;
      headers['Sec-CH-UA-Mobile'] = '?0';
      headers['sec-ch-ua-mobile'] = '?0';
      headers['Sec-CH-UA-Platform'] = '"Windows"';
      headers['sec-ch-ua-platform'] = '"Windows"';

      callback({ requestHeaders: headers });
    });

    // Automatically allow webview permissions and credentials
    sess.setPermissionCheckHandler(() => true);
    sess.setPermissionRequestHandler((webContents: any, permission: any, callback: any) => {
      callback(true);
    });
  };

  applyInterception(currentSession);
  applyInterception(neutrinoSession);

  // Also apply to any assistant-specific partitions if created
  const partitions = ['persist:claude', 'persist:chatgpt', 'persist:gemini', 'persist:deepseek', 'persist:perplexity'];
  for (const part of partitions) {
    applyInterception(session.fromPartition(part));
  }
}

function createWindow() {
  const iconPath = fs.existsSync(path.join(__dirname, '..', 'assets', 'icon.ico'))
    ? path.join(__dirname, '..', 'assets', 'icon.ico')
    : fs.existsSync(path.join(app.getAppPath(), 'assets', 'icon.ico'))
      ? path.join(app.getAppPath(), 'assets', 'icon.ico')
      : undefined;

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    title: 'Neutrino Browser',
    backgroundColor: '#000000',
    icon: iconPath,
    frame: false, // Frameless window with custom macOS traffic light controls
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true, // Allows embedding real Chromium WebViews without iframe restrictions
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  browserManager.setMainWindow(mainWindow);

  // Load the Arc-inspired React UI
  const isDev = process.env.VITE_DEV === 'true';
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    const rendererPath = path.join(__dirname, '..', 'dist-renderer', 'index.html');
    mainWindow.loadFile(rendererPath);
  }

  // Create initial tabs (renderer stays at native 100% standard desktop scale)
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow!.webContents.setZoomFactor(1.0);
    browserManager.createTab('neutrino://newtab', 'space-study');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Register IPC handlers
function setupIpcHandlers() {
  ipcMain.handle('neutrino:navigate', async (_, url: string) => {
    const active = browserManager.getActiveTab();
    if (active) {
      browserManager.updateTab(active.id, { url, isLoading: true });
    }
  });

  ipcMain.handle('neutrino:go-back', async () => {
    // handled directly in webview
  });

  ipcMain.handle('neutrino:go-forward', async () => {
    // handled directly in webview
  });

  ipcMain.handle('neutrino:reload', async () => {
    // handled directly in webview
  });

  ipcMain.handle('neutrino:create-tab', async (_, { url, spaceId }: { url?: string; spaceId?: string }) => {
    return browserManager.createTab(url || 'neutrino://newtab', spaceId);
  });

  ipcMain.handle('neutrino:close-tab', async (_, tabId: string) => {
    browserManager.closeTab(tabId);
  });

  ipcMain.handle('neutrino:select-tab', async (_, tabId: string) => {
    browserManager.setActiveTab(tabId);
  });

  ipcMain.handle('neutrino:toggle-pin-tab', async (_, tabId: string) => {
    browserManager.togglePinTab(tabId);
  });

  ipcMain.handle('neutrino:toggle-sleep-tab', async (_, tabId: string) => {
    browserManager.toggleSleepTab(tabId);
  });

  ipcMain.handle('neutrino:select-space', async (_, spaceId: string) => {
    browserManager.setActiveSpace(spaceId);
  });

  ipcMain.handle('neutrino:create-space', async (_, { name, color }: { name: string; color?: string }) => {
    return browserManager.createSpace(name, color);
  });

  ipcMain.handle('neutrino:delete-space', async (_, spaceId: string) => {
    browserManager.deleteSpace(spaceId);
  });

  ipcMain.handle('neutrino:reorder-tabs', async (_, { draggedTabId, targetTabId }: { draggedTabId: string; targetTabId: string }) => {
    browserManager.reorderTabs(draggedTabId, targetTabId);
  });

  ipcMain.handle('neutrino:update-tab', async (_, { tabId, partial }: { tabId: string; partial: any }) => {
    browserManager.updateTab(tabId, partial);
  });

  ipcMain.handle('neutrino:set-zoom-factor', async (_, factor: number) => {
    const active = browserManager.getActiveTab();
    if (active) {
      browserManager.updateTab(active.id, { zoomFactor: factor });
    }
  });

  ipcMain.handle('neutrino:toggle-shields', async () => {
    // Routed through the settings path so every toggle is saved and broadcast.
    const next = updateSettings({ adblockEnabled: !settings.adblockEnabled });
    return next.adblockEnabled;
  });

  ipcMain.handle('neutrino:get-settings', async () => {
    return settings;
  });

  ipcMain.handle('neutrino:update-settings', async (_, patch: unknown) => {
    return updateSettings(patch);
  });

  ipcMain.handle('neutrino:zen-optimize', async () => {
    const active = browserManager.getActiveTab();
    if (active) {
      resourceManager.sleepAllBackgroundTabs(active.id, browserManager.getActiveMediaTabs());
    }
    return {
      memorySavedMb: resourceManager.getTotalMemorySavedMb(),
      sleepingCount: resourceManager.getSleepingTabsCount(),
    };
  });

  ipcMain.handle('neutrino:media-control', async (_, { action, params }: { action: string; params?: any }) => {
    if (action === 'report-status' && params?.tabId) {
      browserManager.setTabMediaStatus(params.tabId, Boolean(params.isPlaying));
      return { success: true };
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('neutrino:media-command', { action, params });
    }
    return { success: true };
  });

  ipcMain.handle('neutrino:get-shield-stats', async () => {
    return adblockEngine.getStats();
  });

  ipcMain.handle('neutrino:mcp-call', async (_, { method, params }: { method: string; params?: unknown }) => {
    return await mcpServer.handleMessage({ jsonrpc: '2.0', id: Date.now(), method, params });
  });

  ipcMain.handle('neutrino:mcp-get-logs', async () => {
    return mcpServer.getLogs();
  });

  ipcMain.handle('neutrino:window-control', (_, action: 'minimize' | 'maximize' | 'close') => {
    if (!mainWindow) return;
    if (action === 'minimize') mainWindow.minimize();
    if (action === 'maximize') {
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
    }
    if (action === 'close') mainWindow.close();
  });

  ipcMain.handle('neutrino:set-theme-mode', async (_, mode: 'dark' | 'light') => {
    isDarkMode = mode === 'dark';
    nativeTheme.themeSource = isDarkMode ? 'dark' : 'light';

<<<<<<< HEAD
    await applyDarkModeToAllWebviews();
=======
    const allWcs = webContents.getAllWebContents();
    for (const wc of allWcs) {
      if (wc.getType() === 'webview') {
        try {
          if (isDarkMode) {
            await wc.executeJavaScript(`
              try {
                if (window.DarkReader) {
                  DarkReader.enable({ brightness: 100, contrast: 95, sepia: 0 });
                  window.__neutrino_darkreader_active = true;
                }
              } catch(e) {}
            `);
          } else {
            await wc.executeJavaScript(`
              try {
                if (window.DarkReader) {
                  DarkReader.disable();
                  window.__neutrino_darkreader_active = false;
                }
              } catch(e) {}
            `);
          }
        } catch { }
      }
    }
>>>>>>> 2f38679bbeb5a2c4a02d317260450f3d27f772f1
    return { success: true };
  });

  ipcMain.handle('neutrino:capture-tab-preview', async (_, tabUrl: string) => {
    try {
      const allWcs = webContents.getAllWebContents();
      for (const wc of allWcs) {
        if (wc.getType() === 'webview') {
          const u = wc.getURL();
          if (u && (u === tabUrl || tabUrl.startsWith(u) || u.startsWith(tabUrl))) {
            const image = await wc.capturePage();
            if (!image.isEmpty()) {
              return image.toDataURL();
            }
          }
        }
      }
    } catch { }
    return null;
  });
}

app.whenReady().then(() => {
  setupNetworkInterception();
  setupIpcHandlers();
  createWindow();

  // Configure newly created browser windows (including OAuth popups)
  app.on('browser-window-created', (_, win) => {
    win.webContents.setUserAgent(CHROME_USER_AGENT);
    if (win !== mainWindow) {
      win.show();
      win.focus();
    }
  });

  // Universal handlers for all WebContents (browser UI & webview tabs)
  app.on('web-contents-created', (_, contents) => {
    contents.setUserAgent(CHROME_USER_AGENT);

    // Intercept target="_blank" and window.open
    // Allow authentic OAuth popup windows to maintain window.opener, open regular links as Neutrino tabs
    contents.setWindowOpenHandler((details) => {
      const url = details.url || '';
      const hasWindowFeatures =
        details.features &&
        (details.features.includes('width=') ||
          details.features.includes('height=') ||
          details.features.includes('popup='));

      const isPopup =
        details.disposition === 'new-window' ||
        hasWindowFeatures ||
        isAuthOrSecurityUrl(url) ||
        url === 'about:blank' ||
        !url;

      if (isPopup) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 540,
            height: 700,
            title: 'Sign In',
            autoHideMenuBar: true,
            backgroundColor: '#121316',
            frame: true, // Native window frame with standard close/minimize controls
            parent: mainWindow || undefined,
            modal: false,
            webPreferences: {
              partition: 'persist:neutrino',
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: false,
            },
          },
        };
      }

      const active = browserManager.getActiveTab();
      const spaceId = active ? active.spaceId : 'space-study';
      browserManager.createTab(details.url, spaceId);
      return { action: 'deny' };
    });

    // Auto-inject cosmetic adblock, YouTube ad skipper, and universal DarkReader into guest webviews
    if (contents.getType() === 'webview') {
      contents.on('dom-ready', async () => {
        try {
          // Provide resilient stubs for tracking/analytics SDKs so page form handlers don't crash
          await contents.executeJavaScript(`
            try {
              if (!window.dataLayer) window.dataLayer = [];
              if (!window.google_tag_manager) window.google_tag_manager = {};
              if (!window.fbq) { window.fbq = function() { (window.fbq.q = window.fbq.q || []).push(arguments); }; }
            } catch(e) {}
          `).catch(() => { });
          if (adblockEngine.isEnabled()) {
            await contents.insertCSS(adblockEngine.getCosmeticFilterCSS());
            const url = contents.getURL();
            if (url.includes('youtube.com')) {
              await contents.executeJavaScript(adblockEngine.getYouTubeAdSkipperScript());
            }
          }

<<<<<<< HEAD
          await applyDarkMode(contents);
        } catch {}
=======
          if (isDarkMode && darkReaderCode) {
            const url = contents.getURL();
            if (url && !url.startsWith('neutrino://') && !url.startsWith('about:') && !isAuthOrSecurityUrl(url)) {
              const alreadyActive = await contents.executeJavaScript(`Boolean(window.__neutrino_darkreader_active)`).catch(() => false);
              if (!alreadyActive) {
                const hasLib = await contents.executeJavaScript(`typeof window.DarkReader !== 'undefined'`).catch(() => false);
                if (!hasLib) {
                  await contents.executeJavaScript(darkReaderCode).catch(() => { });
                }
                await contents.executeJavaScript(`
                  try {
                    if (window.DarkReader) {
                      DarkReader.setFetchMethod(window.fetch);
                      DarkReader.enable({ brightness: 100, contrast: 95, sepia: 0 });
                      window.__neutrino_darkreader_active = true;
                    }
                  } catch(e) {}
                `).catch(() => { });
              }
            }
          }
        } catch { }
>>>>>>> 2f38679bbeb5a2c4a02d317260450f3d27f772f1
      });
    }

    contents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown') {
        if (input.key === 'Escape') {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('neutrino:escape-pressed');
          }
          return;
        }

        if (input.control || input.meta) {
          const key = input.key.toLowerCase();

<<<<<<< HEAD
        // Ctrl+Comma -> Open Settings (also covers focus inside a webview)
        if (key === ',') {
          event.preventDefault();
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('neutrino:open-settings');
          }
          return;
        }

        // Ctrl+W -> Close active tab
        if (key === 'w') {
          event.preventDefault();
          const active = browserManager.getActiveTab();
          if (active) {
            browserManager.closeTab(active.id);
=======
          // Ctrl+W -> Close active tab
          if (key === 'w') {
            event.preventDefault();
            const active = browserManager.getActiveTab();
            if (active) {
              browserManager.closeTab(active.id);
            }
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('neutrino:close-active-tab');
            }
            return;
>>>>>>> 2f38679bbeb5a2c4a02d317260450f3d27f772f1
          }

          // Ctrl+T -> New Tab & Open Command Bar
          if (key === 't') {
            event.preventDefault();
            const space = browserManager.getActiveSpaceId();
            browserManager.createTab('neutrino://newtab', space);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('neutrino:open-command-bar');
            }
            return;
          }

          // Ctrl+K or Ctrl+L -> Open Command Bar
          if (key === 'k' || key === 'l') {
            event.preventDefault();
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('neutrino:open-command-bar');
            }
            return;
          }

          // Ctrl+E -> Toggle Notification Tabs
          if (key === 'e') {
            event.preventDefault();
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('neutrino:toggle-tabs');
            }
            return;
          }

          // Ctrl+R -> Reload
          if (key === 'r') {
            event.preventDefault();
            if (contents.getType() === 'webview') {
              contents.reload();
            } else {
              const allWcs = webContents.getAllWebContents();
              for (const wc of allWcs) {
                if (wc.getType() === 'webview') {
                  wc.reload();
                }
              }
            }
            return;
          }

          // Zoom Controls: Only for guest webviews, NEVER for host UI
          if (contents.getType() === 'webview') {
            if (input.key === '-' || input.key === '_' || input.code === 'Minus' || input.code === 'NumpadSubtract') {
              event.preventDefault();
              const current = contents.getZoomFactor();
              const next = Math.max(0.5, Math.round((current - 0.1) * 100) / 100);
              contents.setZoomFactor(next);
              const active = browserManager.getActiveTab();
              if (active) {
                browserManager.updateTab(active.id, { zoomFactor: next });
              }
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('neutrino:zoom-updated', { zoomFactor: next });
              }
            } else if (input.key === '=' || input.key === '+' || input.code === 'Equal' || input.code === 'NumpadAdd') {
              event.preventDefault();
              const current = contents.getZoomFactor();
              const next = Math.min(3.0, Math.round((current + 0.1) * 100) / 100);
              contents.setZoomFactor(next);
              const active = browserManager.getActiveTab();
              if (active) {
                browserManager.updateTab(active.id, { zoomFactor: next });
              }
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('neutrino:zoom-updated', { zoomFactor: next });
              }
            } else if (input.key === '0' || input.code === 'Numpad0' || input.code === 'Digit0') {
              event.preventDefault();
              contents.setZoomFactor(1.0);
              const active = browserManager.getActiveTab();
              if (active) {
                browserManager.updateTab(active.id, { zoomFactor: 1.0 });
              }
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('neutrino:zoom-updated', { zoomFactor: 1.0 });
              }
            }
          }
        }
      }
    });
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  resourceManager.destroy();
  mcpServer.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

