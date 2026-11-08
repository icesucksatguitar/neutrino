import { app, BrowserWindow, ipcMain, session, screen, webContents, nativeTheme } from 'electron';
import path from 'path';
import fs from 'fs';
import { BraveShieldEngine } from './adblock/engine';
import { ZenResourceManager } from './resourceManager';
import { McpServer } from './mcp/server';
import { LocalStorageManager } from './sync/storage';
import { BrowserManager } from './browserManager';

// Performance and rendering flags (Clean native Windows Per-Monitor V2 DPI scaling)
app.commandLine.appendSwitch('high-dpi-support', '1');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
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

export const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Modern Firefox desktop User Agent for Google Authentication
// Google BotGuard rejects embedded Chromium/Electron with rrk=46 ("This browser or app may not be secure"),
// but seamlessly authorizes standard web-spec Firefox without triggering embedded Chromium bot checks.
export const GOOGLE_AUTH_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0';

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

// Global user-agent fallback
app.userAgentFallback = CHROME_USER_AGENT;

function setupNetworkInterception() {
  const currentSession = session.defaultSession;
  const neutrinoSession = session.fromPartition('persist:neutrino');

  // Enforce standard clean desktop Chrome user agent across all sessions
  currentSession.setUserAgent(CHROME_USER_AGENT);
  neutrinoSession.setUserAgent(CHROME_USER_AGENT);

  const applyInterception = (sess: any) => {
    // Intercept web requests with Brave-grade ad & tracker blocker
    sess.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details: any, callback: any) => {
      const url = details.url;

      // Allow internal UI and dev tools
      if (url.startsWith('file://') || url.startsWith('devtools://') || url.startsWith('chrome-extension://')) {
        callback({ cancel: false });
        return;
      }

      // Never block authentication, reCAPTCHA, security validation, or telemetry required for login
      if (
        isGoogleAuthUrl(url) ||
        url.includes('recaptcha') ||
        url.includes('gstatic.com') ||
        url.includes('play.google.com/log') ||
        url.includes('identitytoolkit.googleapis.com')
      ) {
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

    // Sanitize headers and dynamically provide Firefox UA for Google accounts to prevent security block
    sess.webRequest.onBeforeSendHeaders((details: any, callback: any) => {
      const headers = { ...details.requestHeaders };

      if (isGoogleAuthUrl(details.url)) {
        headers['User-Agent'] = GOOGLE_AUTH_USER_AGENT;
        delete headers['Sec-CH-UA'];
        delete headers['sec-ch-ua'];
        delete headers['Sec-CH-UA-Mobile'];
        delete headers['sec-ch-ua-mobile'];
        delete headers['Sec-CH-UA-Platform'];
        delete headers['sec-ch-ua-platform'];
        delete headers['Sec-CH-UA-Platform-Version'];
        delete headers['sec-ch-ua-platform-version'];
      } else {
        headers['User-Agent'] = CHROME_USER_AGENT;
        if (headers['Sec-CH-UA']) {
          headers['Sec-CH-UA'] = '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"';
        }
        if (headers['sec-ch-ua']) {
          headers['sec-ch-ua'] = '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"';
        }
      }

      callback({ requestHeaders: headers });
    });

    // Automatically allow webview permissions (media, fullscreen, clipboard, etc.)
    sess.setPermissionRequestHandler((webContents: any, permission: any, callback: any) => {
      callback(true);
    });
  };

  applyInterception(currentSession);
  applyInterception(neutrinoSession);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    title: 'Neutrino Browser',
    backgroundColor: '#000000',
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
    const current = adblockEngine.isEnabled();
    adblockEngine.setEnabled(!current);
    return adblockEngine.isEnabled();
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
        } catch {}
      }
    }
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
    } catch {}
    return null;
  });
}

app.whenReady().then(() => {
  setupNetworkInterception();
  setupIpcHandlers();
  createWindow();

  // Universal handlers for all WebContents (browser UI & webview tabs)
  app.on('web-contents-created', (_, contents) => {
    // Dynamically adjust user agent per destination to ensure seamless Google login
    contents.on('will-navigate', (_, url) => {
      if (isGoogleAuthUrl(url)) {
        contents.setUserAgent(GOOGLE_AUTH_USER_AGENT);
      } else {
        contents.setUserAgent(CHROME_USER_AGENT);
      }
    });

    contents.on('did-start-navigation', (_, url) => {
      if (isGoogleAuthUrl(url)) {
        contents.setUserAgent(GOOGLE_AUTH_USER_AGENT);
      } else {
        contents.setUserAgent(CHROME_USER_AGENT);
      }
    });

    // Intercept target="_blank" and window.open
    // Allow authentic OAuth popup windows to maintain window.opener, open regular links as Neutrino tabs
    contents.setWindowOpenHandler((details) => {
      if (!details.url || details.url === 'about:blank') {
        return { action: 'deny' };
      }

      const isAuthPopup =
        isGoogleAuthUrl(details.url) ||
        details.url.includes('appleid.apple.com') ||
        details.url.includes('github.com/login/oauth') ||
        details.url.includes('/oauth') ||
        details.url.includes('/auth') ||
        (details.features && (details.features.includes('width=') || details.features.includes('height=')));

      if (isAuthPopup) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 520,
            height: 680,
            title: 'Sign In',
            autoHideMenuBar: true,
            backgroundColor: '#000000',
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
          if (adblockEngine.isEnabled()) {
            await contents.insertCSS(adblockEngine.getCosmeticFilterCSS());
            const url = contents.getURL();
            if (url.includes('youtube.com')) {
              await contents.executeJavaScript(adblockEngine.getYouTubeAdSkipperScript());
            }
          }

          if (isDarkMode && darkReaderCode) {
            const url = contents.getURL();
            if (url && !url.startsWith('neutrino://') && !url.startsWith('about:')) {
              await contents.executeJavaScript(darkReaderCode);
              await contents.executeJavaScript(`
                (() => {
                  try {
                    if (window.DarkReader) {
                      DarkReader.setFetchMethod(window.fetch);
                      DarkReader.enable({ brightness: 100, contrast: 95, sepia: 0 });
                      window.__neutrino_darkreader_active = true;
                    }
                  } catch(e) {}
                })();
              `);
            }
          }
        } catch {}
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

