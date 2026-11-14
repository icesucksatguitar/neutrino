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
    await wait(1500);

    console.log('1. Setting active tab to YouTube in renderer...');
    await win.webContents.executeJavaScript(`
      (() => {
        // Find input or dispatch navigate
        window.dispatchEvent(new CustomEvent('neutrino:show-search'));
        const input = document.querySelector('.homescreen-glass-input');
        if (input) {
          input.value = 'https://www.youtube.com';
        }
      })()
    `);

    // Let's create a direct test HTML with webview to see how webview behaves
    const testHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body { width: 100%; height: 100%; overflow: hidden; background: #07080d; }
          .container { width: 100vw; height: 100vh; display: flex; }
          webview { width: 100%; height: 100%; flex: 1; border: none; }
        </style>
      </head>
      <body>
        <div class="container">
          <webview id="wv" src="https://www.youtube.com" useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"></webview>
        </div>
      </body>
      </html>
    `;
    const tempHtmlPath = path.join(__dirname, 'temp_wv.html');
    fs.writeFileSync(tempHtmlPath, testHtml);

    const win2 = new BrowserWindow({
      width: 1400,
      height: 900,
      show: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        webviewTag: true,
      },
    });
    await win2.loadFile(tempHtmlPath);
    await wait(6000);

    const data = await win2.webContents.executeJavaScript(`
      (async () => {
        const wv = document.getElementById('wv');
        const rect = wv.getBoundingClientRect();
        let innerData = {};
        try {
          innerData = await wv.executeJavaScript(\`
            ({
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              devicePixelRatio: window.devicePixelRatio,
              bodyWidth: document.body.clientWidth,
              ytdAppWidth: document.querySelector('ytd-app')?.clientWidth,
              ytdBrowseWidth: document.querySelector('ytd-browse')?.clientWidth,
              primaryWidth: document.querySelector('#primary')?.clientWidth,
              gridWidth: document.querySelector('ytd-rich-grid-renderer')?.clientWidth
            })
          \`);
        } catch(e) {
          innerData = { error: e.message };
        }
        return {
          webviewRect: { width: rect.width, height: rect.height },
          innerData
        };
      })()
    `);

    console.log('Direct Webview Test Result:', JSON.stringify(data, null, 2));

    const img = await win2.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'youtube_direct_webview.png'), img.toPNG());
    console.log('Saved direct webview capture: youtube_direct_webview.png');

    try { fs.unlinkSync(tempHtmlPath); } catch {}
    app.quit();
  } catch (err) {
    console.error('Inspection failed:', err);
    app.quit();
  }
});
