const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\simpl\\.gemini\\antigravity\\brain\\5ab3cecc-0f9a-4067-a03a-0ad1710d3f7c';

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      width: 1400,
      height: 900,
      show: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        webviewTag: true,
      },
    });

    const indexPath = path.join(__dirname, '..', 'dist-renderer', 'index.html');
    await win.loadFile(indexPath);

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    await wait(2000);

    // Navigate to YouTube
    console.log('Navigating active tab to https://www.youtube.com...');
    await win.webContents.executeJavaScript(`
      (() => {
        window.dispatchEvent(new CustomEvent('neutrino:show-search'));
        const input = document.querySelector('.homescreen-glass-input');
        if (input) {
          input.value = 'https://www.youtube.com';
          const form = document.querySelector('.homescreen-glass-search-box');
          if (form) form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }
      })()
    `);

    // Wait for webview to load
    await wait(8000);

    // Inspect webview state
    const webviewDiagnostics = await win.webContents.executeJavaScript(`
      (() => {
        const wv = document.querySelector('webview.chromium-webview');
        if (!wv) return { error: 'No webview element found' };
        const rect = wv.getBoundingClientRect();
        const style = window.getComputedStyle(wv);
        const parent = wv.parentElement;
        const parentRect = parent ? parent.getBoundingClientRect() : null;
        const htmlZoom = document.documentElement.style.zoom;
        const bodyZoom = document.body.style.zoom;
        const localZoom = localStorage.getItem('neutrino_browser_zoom');
        let wvZoom = 'unknown';
        try {
          if (wv.getZoomFactor) wvZoom = wv.getZoomFactor();
        } catch(e) { wvZoom = e.message; }

        return {
          url: wv.getAttribute('src') || wv.getURL?.(),
          htmlZoom,
          bodyZoom,
          localZoom,
          wvZoom,
          rect: { width: rect.width, height: rect.height, top: rect.top, left: rect.left },
          parentRect: parentRect ? { width: parentRect.width, height: parentRect.height } : null,
          wvComputedStyle: {
            display: style.display,
            width: style.width,
            height: style.height,
            flex: style.flex
          }
        };
      })()
    `);

    console.log('Webview Diagnostics:', JSON.stringify(webviewDiagnostics, null, 2));

    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'debug_youtube_render_test.png'), img.toPNG());
    console.log('Saved screenshot: debug_youtube_render_test.png');

    app.quit();
  } catch (err) {
    console.error('Debug script failed:', err);
    app.quit();
  }
});
