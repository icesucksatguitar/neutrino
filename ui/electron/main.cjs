const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow = null;
let rustProcess = null;
let pendingCallbacks = new Map();
let nextRequestId = 1;

// Find neutrino-host.exe
function findRustHostBinary() {
  const candidates = [
    path.join(__dirname, '..', '..', 'native', 'target', 'release', 'neutrino-host.exe'),
    path.join(__dirname, '..', '..', 'dist', 'neutrino-browser', 'bin', 'neutrino-host.exe'),
    path.join(process.resourcesPath, 'bin', 'neutrino-host.exe'),
    path.join(__dirname, 'bin', 'neutrino-host.exe'),
  ];

  for (const candidate of candidates) {
    if (require('fs').existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

// Spawns the Rust native privacy engine
function initRustCore() {
  const binPath = findRustHostBinary();
  if (!binPath) {
    console.warn('[Neutrino Host] Native binary not found. Running with fallback rule engine.');
    return;
  }

  console.log(`[Neutrino Host] Spawning Rust engine: ${binPath}`);
  try {
    rustProcess = spawn(binPath, [], {
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    let buffer = Buffer.alloc(0);

    rustProcess.stdout.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      while (buffer.length >= 4) {
        const msgLen = buffer.readUInt32LE(0);
        if (buffer.length < 4 + msgLen) {
          break; // wait for full message
        }

        const msgBytes = buffer.slice(4, 4 + msgLen);
        buffer = buffer.slice(4 + msgLen);

        try {
          const resp = JSON.parse(msgBytes.toString('utf-8'));
          // Dispatch to first pending callback
          if (pendingCallbacks.size > 0) {
            const firstId = pendingCallbacks.keys().next().value;
            const cb = pendingCallbacks.get(firstId);
            pendingCallbacks.delete(firstId);
            cb(resp);
          }
        } catch (err) {
          console.error('[Neutrino IPC Parse Error]', err);
        }
      }
    });

    rustProcess.on('exit', (code) => {
      console.log(`[Neutrino Host] Rust engine exited with code ${code}`);
      rustProcess = null;
    });
  } catch (err) {
    console.error('[Neutrino Host Error]', err);
  }
}

// Sends a length-prefixed request to the Rust host
function sendRustMessage(action, payload) {
  return new Promise((resolve) => {
    if (!rustProcess || !rustProcess.stdin.writable) {
      resolve(null);
      return;
    }

    const reqId = nextRequestId++;
    pendingCallbacks.set(reqId, resolve);

    const reqObj = { action };
    if (payload !== undefined) {
      reqObj.payload = payload;
    }

    const jsonStr = JSON.stringify(reqObj);
    const jsonBytes = Buffer.from(jsonStr, 'utf-8');
    const header = Buffer.alloc(4);
    header.writeUInt32LE(jsonBytes.length, 0);

    rustProcess.stdin.write(Buffer.concat([header, jsonBytes]));
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    title: 'Neutrino Browser',
    backgroundColor: '#0b0f19',
    frame: true, // Native Windows desktop titlebar and frame
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Load React UI
  const isDev = process.env.VITE_DEV_SERVER === 'true';
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Intercept web requests across sessions with our Rust Privacy Shield
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['*://*/*'] },
    async (details, callback) => {
      const url = details.url;

      // Skip internal UI files
      if (url.startsWith('file://') || url.startsWith('devtools://')) {
        callback({ cancel: false });
        return;
      }

      // Check URL with Rust Privacy Engine
      if (rustProcess) {
        const resp = await sendRustMessage('CheckUrl', { url, tab_id: 1 });
        if (resp && resp.status === 'UrlChecked' && resp.data && resp.data.blocked) {
          console.log(`[Neutrino Shield] Blocked tracker: ${url} (${resp.data.rule_matched})`);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('neutrino:tracker-blocked', {
              url,
              domain: resp.data.domain,
              category: resp.data.category,
              rule: resp.data.rule_matched,
            });
          }
          callback({ cancel: true });
          return;
        }
      }

      callback({ cancel: false });
    }
  );

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(() => {
  initRustCore();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (rustProcess) {
    try {
      rustProcess.kill();
    } catch (_) {}
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers for React UI
ipcMain.handle('neutrino:check-url', async (_, url) => {
  return await sendRustMessage('CheckUrl', { url, tab_id: 1 });
});

ipcMain.handle('neutrino:clean-url', async (_, url) => {
  return await sendRustMessage('CleanUrl', { url });
});

ipcMain.handle('neutrino:get-stats', async () => {
  return await sendRustMessage('GetStats');
});

ipcMain.handle('neutrino:window-control', (_, action) => {
  if (!mainWindow) return;
  if (action === 'minimize') mainWindow.minimize();
  if (action === 'maximize') {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
  if (action === 'close') mainWindow.close();
});
