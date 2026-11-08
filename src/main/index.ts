import { app, BrowserWindow, ipcMain, session, screen, webContents } from 'electron';
import path from 'path';
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

let mainWindow: BrowserWindow | null = null;

// Initialize Core Subsystems
const adblockEngine = new BraveShieldEngine();
const resourceManager = new ZenResourceManager();
const mcpServer = new McpServer();
const storage = new LocalStorageManager();
const browserManager = new BrowserManager(adblockEngine, resourceManager, mcpServer, storage);

mcpServer.start();

const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function setupNetworkInterception() {
  const currentSession = session.defaultSession;
  const neutrinoSession = session.fromPartition('persist:neutrino');

  // Enforce standard clean desktop Chrome user agent across all sessions
  currentSession.setUserAgent(DESKTOP_USER_AGENT);
  neutrinoSession.setUserAgent(DESKTOP_USER_AGENT);

  const applyInterception = (sess: any) => {
    // Intercept web requests with Brave-grade ad & tracker blocker
    sess.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details: any, callback: any) => {
      const url = details.url;

      // Allow internal UI and dev tools
      if (url.startsWith('file://') || url.startsWith('devtools://') || url.startsWith('chrome-extension://')) {
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

    // Strip tracking headers / set privacy user agent
    sess.webRequest.onBeforeSendHeaders((details: any, callback: any) => {
      callback({ requestHeaders: details.requestHeaders });
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
    // Intercept target="_blank" and window.open to open as tabs in Neutrino
    contents.setWindowOpenHandler((details) => {
      if (details.url && details.url !== 'about:blank') {
        const active = browserManager.getActiveTab();
        const spaceId = active ? active.spaceId : 'space-default';
        browserManager.createTab(details.url, spaceId);
      }
      return { action: 'deny' };
    });

    // Auto-inject cosmetic adblock and YouTube ad skipper into guest webviews
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

