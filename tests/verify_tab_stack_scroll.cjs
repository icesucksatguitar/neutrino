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
      frame: false,
      backgroundColor: '#000000',
      webPreferences: {
        preload: path.join(__dirname, '..', 'dist-main', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    const indexPath = path.join(__dirname, '..', 'dist-renderer', 'index.html');
    await win.loadFile(indexPath);
    await new Promise((r) => setTimeout(r, 2600));

    // Open 12 tabs to fill and overflow the tab panel
    console.log('Creating multiple tabs to test scrolling in tab drawer...');
    await win.webContents.executeJavaScript(`
      (() => {
        for (let i = 1; i <= 10; i++) {
          window.neutrino?.createTab?.('https://example.com/tab' + i, 'space-study');
        }
      })()
    `);

    await new Promise((r) => setTimeout(r, 600));

    // Open notification tabs drawer
    await win.webContents.executeJavaScript(`
      window.dispatchEvent(new CustomEvent('neutrino:toggle-tabs', { detail: { open: true } }));
    `);

    await new Promise((r) => setTimeout(r, 800));

    const scrollCheck = await win.webContents.executeJavaScript(`
      (() => {
        const stack = document.querySelector('.notification-card-stack');
        if (!stack) return { found: false };
        const initialScrollTop = stack.scrollTop;
        stack.scrollTop = 350;
        return {
          found: true,
          scrollHeight: stack.scrollHeight,
          clientHeight: stack.clientHeight,
          isScrollable: stack.scrollHeight > stack.clientHeight,
          scrolledTop: stack.scrollTop
        };
      })()
    `);

    console.log('Tab Stack Scroll Diagnostic:', JSON.stringify(scrollCheck, null, 2));

    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_tab_space_scrolling.png'), img.toPNG());
    console.log('Tab scrolling screenshot captured to verified_tab_space_scrolling.png');

    app.quit();
  } catch (err) {
    console.error('Test error:', err);
    app.quit();
  }
});
