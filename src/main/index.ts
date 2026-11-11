import { app, BrowserWindow, ipcMain, session, screen, webContents, nativeTheme, Menu, clipboard, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { BraveShieldEngine } from './adblock/engine';
import { ZenResourceManager } from './resourceManager';
import { McpServer } from './mcp/server';
import { LocalStorageManager } from './sync/storage';
import { BrowserManager } from './browserManager';
import { isGoogleAuthUrl, isAuthOrSecurityUrl } from './urlClassifier';
import { BrowserSettings, normalizeSettings } from './settings';
import { resolveShortcut } from './shortcuts';
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

let mainWindow: BrowserWindow | null = null;

type MainSiteAction = 'back' | 'forward' | 'reload' | 'hard-reload' | 'stop' | 'home' | 'open-find';

function sendSiteAction(action: MainSiteAction, source?: string): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('neutrino:site-action', { action, source });
  }
}

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

function applySettings(prev: BrowserSettings, next: BrowserSettings) {
  if (prev.adblockEnabled !== next.adblockEnabled) {
    adblockEngine.setEnabled(next.adblockEnabled);
  }
  if (prev.zenSleepEnabled !== next.zenSleepEnabled) {
    resourceManager.setAutoSleepEnabled(next.zenSleepEnabled);
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
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setBackgroundColor(isDarkMode ? '#000000' : '#FAF7F2');
      }
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

            if (process.platform !== 'darwin') {
              mainWindow.removeMenu();
            }

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

            // Windows / Linux browser hardware & mouse XButton navigation commands
            mainWindow.on('app-command', (_e, cmd) => {
              if (cmd === 'browser-backward') sendSiteAction('back', 'app-command');
              else if (cmd === 'browser-forward') sendSiteAction('forward', 'app-command');
              else if (cmd === 'browser-refresh') sendSiteAction('reload', 'app-command');
              else if (cmd === 'browser-stop') sendSiteAction('stop', 'app-command');
              else if (cmd === 'browser-home') sendSiteAction('home', 'app-command');
            });

            // macOS trackpad swipe navigation
            mainWindow.on('swipe', (_e, direction) => {
              if (direction === 'left') sendSiteAction('back', 'swipe');
              else if (direction === 'right') sendSiteAction('forward', 'swipe');
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
              sendSiteAction('back', 'ipc');
            });

            ipcMain.handle('neutrino:go-forward', async () => {
              // handled directly in webview
              sendSiteAction('forward', 'ipc');
            });

            ipcMain.handle('neutrino:reload', async () => {
              // handled directly in webview
              sendSiteAction('reload', 'ipc');
            });

            ipcMain.handle('neutrino:hard-reload', async () => {
              sendSiteAction('hard-reload', 'ipc');
            });

            ipcMain.handle('neutrino:stop-loading', async () => {
              sendSiteAction('stop', 'ipc');
            });

            ipcMain.handle('neutrino:reopen-closed-tab', async () => {
              return browserManager.reopenLastClosedTab();
            });

            ipcMain.handle('neutrino:cycle-tab', async (_, direction: 1 | -1) => {
              return browserManager.cycleTab(direction === -1 ? -1 : 1);
            });

            ipcMain.handle('neutrino:open-external-url', async (_, url: string) => {
              if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
                await shell.openExternal(url);
                return true;
              }
              return false;
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

              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.setBackgroundColor(isDarkMode ? '#000000' : '#FAF7F2');
              }
              return { success: true, isDark: isDarkMode };
            });

            nativeTheme.on('updated', () => {
              if (nativeTheme.themeSource === 'system') {
                const nextDark = nativeTheme.shouldUseDarkColors;
                if (nextDark !== isDarkMode) {
                  isDarkMode = nextDark;
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.setBackgroundColor(isDarkMode ? '#000000' : '#FAF7F2');
                  }
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
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }]));
  } else {
    Menu.setApplicationMenu(null);
  }
  setupNetworkInterception();
  vpnController.attachLoginHandler(app);
  setupIpcHandlers();

  // Universal handlers for all WebContents (host UI & webview tabs) — registered
  // BEFORE createWindow() so mainWindow.webContents receives before-input-event.
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

    // Enforce VPN WebRTC policy, cosmetic adblock, YouTube skipper, and site context menus.
    vpnController.applyWebRtcPolicy(contents);
    if (contents.getType() === 'webview') {
      contents.on('dom-ready', async () => {
        try {
          const tasks: Promise<unknown>[] = [
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

      contents.on('context-menu', (_event, params) => {
        const template: Electron.MenuItemConstructorOptions[] = [
          {
            label: 'Back',
            enabled: contents.canGoBack(),
            click: () => {
              if (!contents.isDestroyed() && contents.canGoBack()) contents.goBack();
            },
          },
          {
            label: 'Forward',
            enabled: contents.canGoForward(),
            click: () => {
              if (!contents.isDestroyed() && contents.canGoForward()) contents.goForward();
            },
          },
          {
            label: 'Reload',
            click: () => {
              if (!contents.isDestroyed()) contents.reload();
            },
          },
          { type: 'separator' },
        ];

        if (params.linkURL) {
          template.push(
            {
              label: 'Open Link in New Tab',
              click: () => {
                browserManager.createTab(params.linkURL, browserManager.getActiveSpaceId());
              },
            },
            {
              label: 'Copy Link Address',
              click: () => clipboard.writeText(params.linkURL),
            },
            { type: 'separator' },
          );
        }

        if (params.isEditable) {
          template.push(
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'selectAll' },
            { type: 'separator' },
          );
        } else if (params.selectionText) {
          template.push(
            { role: 'copy' },
            { type: 'separator' },
          );
        }

        const pageUrl = contents.getURL();
        if (pageUrl && pageUrl.startsWith('http')) {
          template.push({
            label: 'Copy Page Address',
            click: () => clipboard.writeText(pageUrl),
          });
        }

        template.push({
          label: 'Inspect Element',
          click: () => {
            if (!contents.isDestroyed()) {
              contents.inspectElement(params.x, params.y);
            }
          },
        });

        const menu = Menu.buildFromTemplate(template);
        if (mainWindow && !mainWindow.isDestroyed()) {
          menu.popup({ window: mainWindow });
        }
      });
    }

    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;

      const isWebview = contents.getType() === 'webview';
      const action = resolveShortcut(input, { isWebview });
      if (!action) return;

      if (action.type === 'escape') {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('neutrino:escape-pressed');
        }
        return;
      }

      event.preventDefault();

      switch (action.type) {
        case 'close-tab': {
          const active = browserManager.getActiveTab();
          if (active) {
            browserManager.closeTab(active.id);
          }
          break;
        }
        case 'reopen-closed-tab':
          browserManager.reopenLastClosedTab();
          break;
        case 'new-tab': {
          const space = browserManager.getActiveSpaceId();
          browserManager.createTab('neutrino://newtab', space);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('neutrino:open-command-bar');
          }
          break;
        }
        case 'next-tab':
          browserManager.cycleTab(1);
          break;
        case 'prev-tab':
          browserManager.cycleTab(-1);
          break;
        case 'select-space': {
          if (browserManager.selectSpaceByIndex(action.index) && mainWindow && !mainWindow.isDestroyed()) {
            const activeSpaceId = browserManager.getActiveSpaceId();
            const space = browserManager.getSpaces().find((s) => s.id === activeSpaceId);
            if (space) {
              mainWindow.webContents.send('neutrino:space-switched', { spaceId: space.id, spaceName: space.name });
            }
          }
          break;
        }
        case 'go-back':
          sendSiteAction('back', 'shortcut');
          break;
        case 'go-forward':
          sendSiteAction('forward', 'shortcut');
          break;
        case 'go-home':
          sendSiteAction('home', 'shortcut');
          break;
        case 'reload':
          sendSiteAction('reload', 'shortcut');
          break;
        case 'hard-reload':
          sendSiteAction('hard-reload', 'shortcut');
          break;
        case 'stop':
          sendSiteAction('stop', 'shortcut');
          break;
        case 'open-command-bar':
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('neutrino:open-command-bar');
          }
          break;
        case 'open-find':
          sendSiteAction('open-find', 'shortcut');
          break;
        case 'toggle-tabs':
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('neutrino:toggle-tabs');
          }
          break;
        case 'open-history':
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('neutrino:open-history');
          }
          break;
        case 'open-settings':
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('neutrino:open-settings');
          }
          break;
        case 'zoom-out': {
          if (!isWebview) break;
          const current = contents.getZoomFactor();
          const next = Math.max(0.5, Math.round((current - 0.1) * 100) / 100);
          contents.setZoomFactor(next);
          const active = browserManager.getActiveTab();
          if (active) browserManager.updateTab(active.id, { zoomFactor: next });
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('neutrino:zoom-updated', { zoomFactor: next });
          }
          break;
        }
        case 'zoom-in': {
          if (!isWebview) break;
          const current = contents.getZoomFactor();
          const next = Math.min(3.0, Math.round((current + 0.1) * 100) / 100);
          contents.setZoomFactor(next);
          const active = browserManager.getActiveTab();
          if (active) browserManager.updateTab(active.id, { zoomFactor: next });
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('neutrino:zoom-updated', { zoomFactor: next });
          }
          break;
        }
        case 'zoom-reset': {
          if (!isWebview) break;
          contents.setZoomFactor(1.0);
          const active = browserManager.getActiveTab();
          if (active) browserManager.updateTab(active.id, { zoomFactor: 1.0 });
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('neutrino:zoom-updated', { zoomFactor: 1.0 });
          }
          break;
        }
      }
    });
  });

  createWindow();
  void vpnController.initialize();

  // Configure newly created child browser windows (including OAuth popups)
  app.on('browser-window-created', (_, win) => {
    if (win !== mainWindow) {
      win.show();
      win.focus();
    }
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

