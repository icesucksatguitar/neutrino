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
import { shouldInjectDarkReader, INSTANT_DARK_PREPAINT_CSS, buildDarkModeEnableScript, buildDarkModeDisableScript } from './darkMode';
import { HistoryManager, HistoryClearRange, HistoryQueryOptions } from './history';
import { VpnController } from './vpn';
import { applyBrowserIdentity, getBrowserUserAgent } from './browserIdentity';
import { decideWindowOpen } from './windowOpen';
import { AuthHandoffController } from './authHandoff';

// Ultra-low-memory Chromium switches for Windows (compatible with YouTube/media tests)
app.commandLine.appendSwitch('high-dpi-support', '1');
app.commandLine.appendSwitch('num-raster-threads', '1');
app.commandLine.appendSwitch('enable-quic');
app.commandLine.appendSwitch('enable-fast-unload');
app.commandLine.appendSwitch('enable-low-end-device-mode');
app.commandLine.appendSwitch('in-process-gpu');
app.commandLine.appendSwitch('renderer-process-limit', '2');
app.commandLine.appendSwitch('process-per-site');
app.commandLine.appendSwitch('disk-cache-size', '4194304');
app.commandLine.appendSwitch('media-cache-size', '4194304');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-domain-reliability');
app.commandLine.appendSwitch('disable-sync');
app.commandLine.appendSwitch('no-pings');
app.commandLine.appendSwitch('js-flags', '--optimize-for-size --expose-gc');
app.commandLine.appendSwitch(
  'disable-features',
  'Vulkan,BackForwardCache,SpareRendererForSitePerProcess,AutofillServerCommunication,OptimizationHints,MediaRouter,CertificateTransparencyComponentUpdater'
);

// Lazy-load DarkReader script on first eligible page in dark mode (0 KB at idle Homescreen)
let cachedDarkReaderCode: string | null = null;
function getDarkReaderCode(): string {
  if (cachedDarkReaderCode !== null) return cachedDarkReaderCode;
  try {
    const possiblePaths = [
      path.join(__dirname, '..', 'node_modules', 'darkreader', 'darkreader.js'),
      path.join(app.getAppPath(), 'node_modules', 'darkreader', 'darkreader.js'),
      path.join(__dirname, 'darkreader.js'),
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        cachedDarkReaderCode = fs.readFileSync(p, 'utf8');
        return cachedDarkReaderCode;
      }
    }
  } catch (e) {
    console.error('Failed to load darkreader.js:', e);
  }
  cachedDarkReaderCode = '';
  return cachedDarkReaderCode;
}

let mainWindow: BrowserWindow | null = null;

// Initialize Core Subsystems
const adblockEngine = new BraveShieldEngine();
const resourceManager = new ZenResourceManager();
const mcpServer = new McpServer();
const storage = new LocalStorageManager();
const dataDir = path.join(app.getPath('userData'), 'neutrino-data');
const historyManager = new HistoryManager(path.join(dataDir, 'history.json'));
const vpnController = new VpnController(path.join(dataDir, 'vpn-config.json'), ['persist:neutrino']);
const browserManager = new BrowserManager(adblockEngine, resourceManager, mcpServer, storage, historyManager);

mcpServer.start();

// Browser settings: load, fill defaults, and apply the parts owned by the main process.
let settings: BrowserSettings = normalizeSettings(storage.loadState().settings);
let isDarkMode = settings.theme !== 'light';
nativeTheme.themeSource = isDarkMode ? 'dark' : 'light';
adblockEngine.setEnabled(settings.adblockEnabled);
resourceManager.setAutoSleepEnabled(settings.zenSleepEnabled);

function getWebviewContents(): WebContents[] {
  return webContents.getAllWebContents().filter((wc) => !wc.isDestroyed() && wc.getType() === 'webview');
}

const prepaintCssKeys = new WeakMap<WebContents, Set<string>>();
const prepaintInFlight = new WeakMap<WebContents, Promise<void>>();
const darkReaderLibLoaded = new WeakSet<WebContents>();

async function applyPrepaintDarkCss(wc: WebContents): Promise<void> {
  if (wc.isDestroyed()) return;
  const inflight = prepaintInFlight.get(wc);
  if (inflight) {
    await inflight;
    return;
  }
  const existing = prepaintCssKeys.get(wc);
  if (existing && existing.size > 0) return;

  const task = (async () => {
    try {
      const key = await wc.insertCSS(INSTANT_DARK_PREPAINT_CSS);
      if (wc.isDestroyed()) return;
      let stillEligible = false;
      try {
        stillEligible = isDarkMode && shouldInjectDarkReader(wc.getURL(), settings.darkModeExclusions);
      } catch { }
      if (!stillEligible) {
        await wc.removeInsertedCSS(key).catch(() => { });
        return;
      }
      let keys = prepaintCssKeys.get(wc);
      if (!keys) {
        keys = new Set<string>();
        prepaintCssKeys.set(wc, keys);
      }
      keys.add(key);
    } catch {
    } finally {
      prepaintInFlight.delete(wc);
    }
  })();
  prepaintInFlight.set(wc, task);
  await task;
}

async function removePrepaintDarkCss(wc: WebContents): Promise<void> {
  if (wc.isDestroyed()) return;
  const inflight = prepaintInFlight.get(wc);
  if (inflight) {
    await inflight;
  }
  const keys = prepaintCssKeys.get(wc);
  if (!keys || keys.size === 0) return;
  prepaintCssKeys.delete(wc);
  await Promise.all(
    Array.from(keys).map((key) => wc.removeInsertedCSS(key).catch(() => { })),
  );
}

/**
 * The only code that loads DarkReader into webviews. Injects instant pre-paint CSS early,
 * enables DarkReader on eligible pages in one IPC roundtrip while dark mode is on, and disables
 * it everywhere else without reloading the page.
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

  if (isDarkMode && eligible) {
    const darkReaderCode = getDarkReaderCode();
    if (darkReaderCode) {
      const prepaintPromise = applyPrepaintDarkCss(wc);
      const includeLib = !darkReaderLibLoaded.has(wc);
      const jsPromise = run(buildDarkModeEnableScript(darkReaderCode, includeLib)).then((res) => {
        if (res !== undefined && !wc.isDestroyed()) {
          darkReaderLibLoaded.add(wc);
        }
      });
      await Promise.allSettled([prepaintPromise, jsPromise]);
      // DarkReader now owns the page dark palette; remove temporary pre-paint stylesheet.
      await removePrepaintDarkCss(wc);
      return;
    }
  }

    const removePromise = removePrepaintDarkCss(wc);
    if (darkReaderLibLoaded.has(wc) || !isDarkMode) {
      const disablePromise = run(buildDarkModeDisableScript(!isDarkMode && eligible));
      await Promise.allSettled([removePromise, disablePromise]);
      return;
    }
    await removePromise;
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
    const safePatch =
      patch !== null && typeof patch === 'object' && !Array.isArray(patch) ? (patch as Record<string, unknown>) : {};
    const prev = settings;
    const latest = storage.loadState().settings;
    const mergedRaw: Record<string, unknown> = { ...prev, ...latest, ...safePatch };
    if (
      safePatch.spaceThemes !== null &&
      typeof safePatch.spaceThemes === 'object' &&
      !Array.isArray(safePatch.spaceThemes)
    ) {
      const prevThemes =
        prev.spaceThemes && typeof prev.spaceThemes === 'object' && !Array.isArray(prev.spaceThemes)
          ? prev.spaceThemes
          : {};
      const latestThemes =
        latest.spaceThemes && typeof latest.spaceThemes === 'object' && !Array.isArray(latest.spaceThemes)
          ? (latest.spaceThemes as Record<string, unknown>)
          : {};
      mergedRaw.spaceThemes = {
        ...prevThemes,
        ...latestThemes,
        ...(safePatch.spaceThemes as Record<string, unknown>),
      };
    }
    const next = normalizeSettings(mergedRaw);
    settings = next;
    if (
      Object.prototype.hasOwnProperty.call(safePatch, 'theme') &&
      (next.theme === 'light' || next.theme === 'dark')
    ) {
      const nextDark = next.theme !== 'light';
      if (nextDark !== isDarkMode) {
        isDarkMode = nextDark;
        nativeTheme.themeSource = isDarkMode ? 'dark' : 'light';
        void applyDarkModeToAllWebviews();
      }
    }
    applySettings(prev, next);
    storage.saveSettings(next);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('neutrino:settings-updated', next);
    }
    return next;
  }

  // Re-exported so existing imports from index (e.g. tests requiring dist-main/index.js) keep working.
  export { isGoogleAuthUrl, isAuthOrSecurityUrl };

  export function isMediaStreamingUrl(url: string): boolean {
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

  // One honest browser identity for every session (see src/main/userAgent.ts). Set before any
  // window or session exists so nothing loads with Electron's default UA.
  app.userAgentFallback = getBrowserUserAgent();

  // Continues Google sign-in in the system browser when Google refuses it in-app.
  const authHandoff = new AuthHandoffController({ getMainWindow: () => mainWindow });

  function setupNetworkInterception() {
    const currentSession = session.defaultSession;
    const neutrinoSession = session.fromPartition('persist:neutrino');

    const applyInterception = (sess: Electron.Session) => {
      applyBrowserIdentity(sess);

      // Intercept web requests with Brave-grade ad & tracker blocker
      sess.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details: any, callback: any) => {
        const url = details.url;

        // Allow internal UI and dev tools
        if (url.startsWith('file://') || url.startsWith('devtools://') || url.startsWith('chrome-extension://')) {
          callback({ cancel: false });
          return;
        }

        // Built-in VPN Kill Switch: block outbound webview traffic if tunnel drops while active
        if (vpnController.shouldBlockForKillSwitch(url)) {
          callback({ cancel: true });
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

      // Request headers are not rewritten: Chromium's own User-Agent and Sec-CH-UA* values already
      // match navigator.userAgent and navigator.userAgentData.

      // Automatically allow webview permissions and credentials
      sess.setPermissionCheckHandler(() => true);
      sess.setPermissionRequestHandler((webContents: any, permission: any, callback: any) => {
        callback(true);
      });
    };

    const interceptedSessions = new WeakSet<Electron.Session>();
    const applyIfNew = (sess: Electron.Session) => {
      if (interceptedSessions.has(sess)) return;
      interceptedSessions.add(sess);
      applyInterception(sess);
    };

    applyIfNew(currentSession);
    applyIfNew(neutrinoSession);

    // Attach adblock/header interception lazily only if another partition is ever created
    app.on('session-created', (sess) => {
      applyIfNew(sess);
    });
  }

  function createWindow() {
    const iconPath = fs.existsSync(path.join(__dirname, '..', 'assets', 'icon.ico'))
      ? path.join(__dirname, '..', 'assets', 'icon.ico')
      : fs.existsSync(path.join(app.getAppPath(), 'assets', 'icon.ico'))
        ? path.join(app.getAppPath(), 'assets', 'icon.ico')
        : undefined;

    const savedState = storage.loadState();
    const savedBounds = savedState.settings?.windowBounds as
      | { width?: number; height?: number; x?: number; y?: number; isMaximized?: boolean }
      | undefined;

    const initialWidth = typeof savedBounds?.width === 'number' && savedBounds.width >= 980 ? savedBounds.width : 1400;
    const initialHeight = typeof savedBounds?.height === 'number' && savedBounds.height >= 640 ? savedBounds.height : 900;
    let initialX: number | undefined;
    let initialY: number | undefined;
    if (typeof savedBounds?.x === 'number' && typeof savedBounds?.y === 'number') {
      const displays = screen.getAllDisplays();
      const visibleOnDisplay = displays.some((d) => {
        const wa = d.workArea;
        return (
          savedBounds.x! < wa.x + wa.width - 100 &&
          savedBounds.x! + initialWidth > wa.x + 100 &&
          savedBounds.y! < wa.y + wa.height - 60 &&
          savedBounds.y! + initialHeight > wa.y + 60
        );
      });
      if (visibleOnDisplay) {
        initialX = savedBounds.x;
        initialY = savedBounds.y;
      }
    }

    mainWindow = new BrowserWindow({
      width: initialWidth,
      height: initialHeight,
      x: initialX,
      y: initialY,
      minWidth: 980,
      minHeight: 640,
      title: 'Neutrino Browser',
      backgroundColor: isDarkMode ? '#000000' : '#FAF7F2',
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
        spellcheck: false,
        backgroundThrottling: true,
      },
    });

    if (savedBounds?.isMaximized) {
      mainWindow.maximize();
    }

    let boundsTimer: NodeJS.Timeout | null = null;
    const persistCurrentBounds = () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const isMax = mainWindow.isMaximized();
      const bounds = mainWindow.getNormalBounds ? mainWindow.getNormalBounds() : mainWindow.getBounds();
      const windowBounds = {
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        isMaximized: isMax,
      };
      const merged = storage.patchSettings({ windowBounds });
      settings = normalizeSettings(merged);
    };

    const saveBounds = () => {
      if (boundsTimer) clearTimeout(boundsTimer);
      boundsTimer = setTimeout(persistCurrentBounds, 500);
    };

    mainWindow.on('resize', saveBounds);
    mainWindow.on('move', saveBounds);
    mainWindow.on('maximize', saveBounds);
    mainWindow.on('unmaximize', saveBounds);
    mainWindow.on('close', () => {
      if (boundsTimer) {
        clearTimeout(boundsTimer);
        boundsTimer = null;
      }
      persistCurrentBounds();
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

    let gcTimer: NodeJS.Timeout | null = null;
    const scheduleIdleTrim = (delayMs: number) => {
      if (gcTimer) clearTimeout(gcTimer);
      gcTimer = setTimeout(() => {
        gcTimer = null;
        try {
          if (typeof global.gc === 'function') global.gc();
        } catch { }
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('neutrino:trim-memory');
          void mainWindow.webContents.executeJavaScript('window.gc?.()').catch(() => { });
        }
      }, delayMs);
    };

    mainWindow.on('blur', () => {
      scheduleIdleTrim(1500);
    });

    // Create initial tabs (renderer stays at native 100% standard desktop scale)
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow!.webContents.setZoomFactor(1.0);
      browserManager.createTab('neutrino://newtab', browserManager.getActiveSpaceId());
      scheduleIdleTrim(3200);
    });

    mainWindow.on('closed', () => {
      if (gcTimer) {
        clearTimeout(gcTimer);
        gcTimer = null;
      }
      mainWindow = null;
    });
  }

  // Register IPC handlers
  function setupIpcHandlers() {
    authHandoff.registerIpc(ipcMain);

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

    ipcMain.handle('neutrino:set-theme-mode', async (_, mode: 'dark' | 'light' | 'system') => {
      const requested = mode === 'light' ? 'light' : mode === 'system' ? 'system' : 'dark';
      nativeTheme.themeSource = requested;
      isDarkMode = requested === 'system' ? nativeTheme.shouldUseDarkColors : requested === 'dark';

      await applyDarkModeToAllWebviews();
      return { success: true, isDark: isDarkMode };
    });

    nativeTheme.on('updated', () => {
      if (nativeTheme.themeSource === 'system') {
        const nextDark = nativeTheme.shouldUseDarkColors;
        if (nextDark !== isDarkMode) {
          isDarkMode = nextDark;
          void applyDarkModeToAllWebviews();
        }
      }
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

    // Browsing History IPC handlers
    ipcMain.handle('neutrino:get-history', async (_, options?: HistoryQueryOptions) => {
      return historyManager.getEntries(options);
    });

    ipcMain.handle('neutrino:delete-history-entry', async (_, target: { id?: string; url?: string; timestamp?: number }) => {
      return historyManager.deleteEntry(target || {});
    });

    ipcMain.handle('neutrino:clear-history', async (_, range: HistoryClearRange = 'all') => {
      return historyManager.clear(range);
    });

    historyManager.onChange((entries) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('neutrino:history-updated', entries);
      }
    });

    // Built-in VPN / Privacy Tunnel IPC handlers
    ipcMain.handle('neutrino:get-vpn-status', async () => {
      return vpnController.getStatus();
    });

    ipcMain.handle('neutrino:connect-vpn', async (_, patch?: any) => {
      return vpnController.connect(patch);
    });

    ipcMain.handle('neutrino:disconnect-vpn', async () => {
      return vpnController.disconnect();
    });

    ipcMain.handle('neutrino:update-vpn-config', async (_, patch: any) => {
      return vpnController.applyConfig(patch);
    });

    ipcMain.handle('neutrino:check-vpn-ip', async () => {
      return vpnController.verifyPublicIp();
    });

    vpnController.onStatusChange((status) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('neutrino:vpn-status-updated', status);
      }
    });
  }

  app.whenReady().then(() => {
    setupNetworkInterception();
    vpnController.attachLoginHandler(app);
    setupIpcHandlers();
    createWindow();
    void vpnController.initialize();

    // Configure newly created browser windows (including OAuth popups)
    app.on('browser-window-created', (_, win) => {
      if (win !== mainWindow) {
        win.show();
        win.focus();
      }
    });

    // Universal handlers for all WebContents (browser UI & webview tabs)
    app.on('web-contents-created', (_, contents) => {
      authHandoff.attach(contents);

      // Intercept target="_blank" and window.open: sign-in and featured popups stay real child
      // windows (window.opener intact), regular links open as Neutrino tabs. See windowOpen.ts.
      contents.setWindowOpenHandler((details) => {
        const decision = decideWindowOpen(details, {
          isAuthOrSecurityUrl,
          mainWindow,
          activeTab: browserManager.getActiveTab(),
        });
        if (decision.action === 'allow') {
          return { action: 'allow', overrideBrowserWindowOptions: decision.overrideBrowserWindowOptions };
        }
        browserManager.createTab(decision.createTab.url, decision.createTab.spaceId);
        return { action: 'deny' };
      });

      // Auto-inject pre-paint dark CSS immediately on navigation commit, plus parallel cosmetic
      // adblock, YouTube skipper, and single-roundtrip DarkReader on dom-ready.
      vpnController.applyWebRtcPolicy(contents);
      if (contents.getType() === 'webview') {
        contents.on('did-frame-navigate', (_event, navUrl, _httpCode, _httpText, isMainFrame) => {
          if (!isMainFrame) return;
          darkReaderLibLoaded.delete(contents);
          prepaintCssKeys.delete(contents);
          if (isDarkMode && shouldInjectDarkReader(navUrl, settings.darkModeExclusions)) {
            void applyPrepaintDarkCss(contents);
          }
        });

        contents.on('did-navigate-in-page', (_event, navUrl, isMainFrame) => {
          if (!isMainFrame) return;
          if (isDarkMode && shouldInjectDarkReader(navUrl, settings.darkModeExclusions)) {
            if (!darkReaderLibLoaded.has(contents)) {
              void applyDarkMode(contents);
            }
          } else {
            void applyDarkMode(contents);
          }
        });

        contents.on('dom-ready', async () => {
          try {
            const tasks: Promise<unknown>[] = [
              applyDarkMode(contents),
              contents.executeJavaScript(`
              try {
                if (!window.dataLayer) window.dataLayer = [];
                if (!window.google_tag_manager) window.google_tag_manager = {};
                if (!window.fbq) { window.fbq = function() { (window.fbq.q = window.fbq.q || []).push(arguments); }; }
              } catch(e) {}
            `).catch(() => { }),
            ];
            if (adblockEngine.isEnabled()) {
              tasks.push(contents.insertCSS(adblockEngine.getCosmeticFilterCSS()).catch(() => { }));
              const url = contents.getURL();
              if (url.includes('youtube.com')) {
                tasks.push(contents.executeJavaScript(adblockEngine.getYouTubeAdSkipperScript()).catch(() => { }));
              }
            }
            await Promise.allSettled(tasks);
          } catch { }
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
              }
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('neutrino:close-active-tab');
              }
              return;
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

            // Ctrl+H -> Open Browsing History
            if (key === 'h') {
              event.preventDefault();
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('neutrino:open-history');
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

  app.on('before-quit', () => {
    historyManager.destroy();
    void vpnController.cleanupOnQuit();
  });

  app.on('window-all-closed', () => {
    historyManager.destroy();
    void vpnController.cleanupOnQuit();
    resourceManager.destroy();
    mcpServer.stop();
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

