const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\simpl\\.gemini\\antigravity\\brain\\5ab3cecc-0f9a-4067-a03a-0ad1710d3f7c';

app.commandLine.appendSwitch('no-sandbox');

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      width: 1440,
      height: 900,
      show: true,
      frame: false,
      backgroundColor: '#000000',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        webviewTag: true,
        preload: path.join(__dirname, 'preload_mock.cjs'),
      },
    });

    const indexPath = path.join(__dirname, '..', 'dist-renderer', 'index.html');
    await win.loadFile(indexPath);

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    await wait(2200);

    console.log('=== VERIFYING SITE OFFSET & ZERO WINDOW CONTROL OVERLAP ===');

    // 1. Verify Homescreen (neutrino://newtab)
    console.log('\n1. Checking Homescreen layout (new tab):');
    const newtabDiag = await win.webContents.executeJavaScript(`
      (() => {
        const viewport = document.querySelector('.arc-viewport-container');
        const capsule = document.querySelector('.floating-top-chrome-capsule');
        const rect = viewport ? viewport.getBoundingClientRect() : null;
        return {
          hasWithSiteOffset: viewport ? viewport.classList.contains('with-site-top-offset') : false,
          viewportTop: rect ? rect.top : null,
          viewportHeight: rect ? rect.height : null,
          capsuleHasOnWebpage: capsule ? capsule.classList.contains('on-webpage') : false,
        };
      })()
    `);
    console.log(' - Homescreen Diag:', JSON.stringify(newtabDiag, null, 2));

    const newtabImg = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_newtab_fullbleed.png'), newtabImg.toPNG());
    console.log(' - Captured verified_newtab_fullbleed.png');

    // 2. Switch to active webpage (e.g. YouTube)
    console.log('\n2. Navigating to active webpage...');
    await win.webContents.executeJavaScript(`
      (() => {
        if (window.neutrino && window.neutrino.emitState) {
          window.neutrino.emitState(prev => ({
            ...prev,
            tabs: [
              {
                id: 'tab-yt',
                url: 'https://www.youtube.com',
                title: 'YouTube',
                isLoading: false,
                canGoBack: true,
                canGoForward: false,
                isPinned: false,
                isSleeping: false,
                blockedCount: 0,
                spaceId: 'space-study'
              }
            ],
            activeTabId: 'tab-yt'
          }));
        }
      })();
    `);
    await wait(700);

    // 3. Measure bounding client rects on active webpage
    const webpageDiag = await win.webContents.executeJavaScript(`
      (() => {
        const viewport = document.querySelector('.arc-viewport-container');
        const webview = document.querySelector('webview');
        const capsule = document.querySelector('.floating-top-chrome-capsule');
        const trafficLights = document.querySelector('.macos-traffic-lights');
        const windowControls = document.querySelector('.macos-window-controls-cluster');
        const dragBar = document.querySelector('.macos-window-drag-bar');

        const vRect = viewport ? viewport.getBoundingClientRect() : null;
        const wRect = webview ? webview.getBoundingClientRect() : null;
        const cRect = capsule ? capsule.getBoundingClientRect() : null;
        const tRect = trafficLights ? trafficLights.getBoundingClientRect() : null;
        const wcRect = windowControls ? windowControls.getBoundingClientRect() : null;
        const dRect = dragBar ? dragBar.getBoundingClientRect() : null;

        const zeroOverlap = wcRect && wRect ? wcRect.bottom <= wRect.top : false;

        return {
          viewportHasWithSiteOffset: viewport ? viewport.classList.contains('with-site-top-offset') : false,
          viewportTop: vRect ? vRect.top : null,
          viewportHeight: vRect ? vRect.height : null,
          webviewTop: wRect ? wRect.top : null,
          webviewHeight: wRect ? wRect.height : null,
          capsuleHasOnWebpage: capsule ? capsule.classList.contains('on-webpage') : false,
          capsuleTop: cRect ? cRect.top : null,
          capsuleHeight: cRect ? cRect.height : null,
          windowControlsTop: wcRect ? wcRect.top : null,
          windowControlsBottom: wcRect ? wcRect.bottom : null,
          trafficLightsTop: tRect ? tRect.top : null,
          trafficLightsBottom: tRect ? tRect.bottom : null,
          dragBarTop: dRect ? dRect.top : null,
          dragBarHeight: dRect ? dRect.height : null,
          zeroOverlapWithSite: zeroOverlap
        };
      })()
    `);
    console.log(' - Webpage Diag:', JSON.stringify(webpageDiag, null, 2));

    const siteImg = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_site_offset_clean.png'), siteImg.toPNG());
    console.log(' - Captured verified_site_offset_clean.png');

    win.destroy();
    app.quit();
  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  }
});
