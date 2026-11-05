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
    await wait(1000);

    // Mock active tab to YouTube
    console.log('Mounting webview with YouTube in Neutrino App...');
    await win.webContents.executeJavaScript(`
      (() => {
        // Find webview-host
        const host = document.querySelector('.webview-host');
        if (host) {
          // Hide homescreen if present
          const home = host.querySelector('.homescreen-fullscreen');
          if (home) home.style.display = 'none';

          // Insert active tab wrapper with webview
          let wrapper = host.querySelector('.tab-webview-wrapper');
          if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.className = 'tab-webview-wrapper active';
            wrapper.style.display = 'flex';
            wrapper.style.flex = '1 1 100%';
            wrapper.style.width = '100%';
            wrapper.style.height = '100%';
            wrapper.style.position = 'relative';

            const wv = document.createElement('webview');
            wv.className = 'chromium-webview';
            wv.src = 'https://www.youtube.com';
            wv.setAttribute('useragent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
            wv.setAttribute('partition', 'persist:neutrino');
            wv.style.display = 'flex';
            wv.style.flex = '1 1 100%';
            wv.style.width = '100%';
            wv.style.height = '100%';
            wrapper.appendChild(wv);
            host.appendChild(wrapper);
          }
        }
      })()
    `);

    await wait(7000);

    const diagnostics = await win.webContents.executeJavaScript(`
      (async () => {
        const shell = document.querySelector('.arc-app-shell');
        const sidebar = document.querySelector('.arc-sidebar');
        const viewport = document.querySelector('.arc-viewport-container');
        const canvas = document.querySelector('.arc-web-canvas-frame');
        const host = document.querySelector('.webview-host');
        const wrapper = document.querySelector('.tab-webview-wrapper.active');
        const wv = document.querySelector('webview.chromium-webview');

        const getBox = (el) => el ? {
          rect: el.getBoundingClientRect(),
          computedWidth: window.getComputedStyle(el).width,
          computedHeight: window.getComputedStyle(el).height,
          display: window.getComputedStyle(el).display,
          flex: window.getComputedStyle(el).flex
        } : null;

        let innerWv = {};
        if (wv) {
          try {
            innerWv = await wv.executeJavaScript(\`({
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              bodyWidth: document.body.clientWidth,
              ytdAppWidth: document.querySelector('ytd-app')?.clientWidth,
              gridWidth: document.querySelector('ytd-rich-grid-renderer')?.clientWidth
            })\`);
          } catch(e) {
            innerWv = { error: e.message };
          }
        }

        return {
          documentZoom: document.documentElement.style.zoom,
          localStorageZoom: localStorage.getItem('neutrino_browser_zoom'),
          shell: getBox(shell),
          sidebar: getBox(sidebar),
          viewport: getBox(viewport),
          canvas: getBox(canvas),
          host: getBox(host),
          wrapper: getBox(wrapper),
          wv: getBox(wv),
          innerWv
        };
      })()
    `);

    console.log('Neutrino YouTube Diagnostics:', JSON.stringify(diagnostics, null, 2));

    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'neutrino_youtube_test.png'), img.toPNG());
    console.log('Saved screenshot: neutrino_youtube_test.png');

    app.quit();
  } catch (err) {
    console.error('Test failed:', err);
    app.quit();
  }
});
