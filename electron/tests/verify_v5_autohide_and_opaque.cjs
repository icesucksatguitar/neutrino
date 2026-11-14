const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\simpl\\.gemini\\antigravity\\brain\\5ab3cecc-0f9a-4067-a03a-0ad1710d3f7c';

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      width: 1440,
      height: 900,
      frame: false,
      show: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'test_preload.cjs'),
        webviewTag: true,
      },
    });

    win.webContents.on('console-message', (e, level, msg) => {
      console.log('[Renderer]:', msg);
    });

    const indexPath = path.join(__dirname, '..', 'dist-renderer', 'index.html');
    await win.loadFile(indexPath);

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    await wait(1800);

    // 1. Dark Mode Homescreen
    await win.webContents.executeJavaScript(`
      localStorage.setItem('neutrino_welcome_completed', 'true');
      localStorage.setItem('neutrino_user_name', 'Yash');
      localStorage.setItem('neutrino_dark_theme', 'true');
      document.documentElement.setAttribute('data-theme', 'dark');
      document.body.classList.add('dark-mode');
    `);
    await wait(600);

    const imgDarkHome = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_v5_dark_home_opaque.png'), imgDarkHome.toPNG());
    console.log('1. Captured dark home');

    // 2. Click on a pinned site (e.g. YouTube or GitHub) to navigate to a webpage
    await win.webContents.executeJavaScript(`
      (() => {
        const pin = document.querySelector('.pin-dock-item');
        if (pin) {
          pin.click();
          console.log('Clicked pin dock item!');
        }
      })()
    `);
    await wait(1500);

    // 3. Webpage with Top Chrome Autohidden (No interference with site header!)
    const imgSiteHidden = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_v5_site_top_autohidden.png'), imgSiteHidden.toPNG());
    console.log('2. Captured site with autohidden top controls');

    // 4. Hover near top (y <= 36px) to reveal top chrome
    win.webContents.sendInputEvent({ type: 'mouseMove', x: 200, y: 10 });
    await wait(800);

    const imgSiteRevealed = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_v5_site_top_revealed_opaque.png'), imgSiteRevealed.toPNG());
    console.log('3. Captured site with revealed opaque controls');

    // 5. Open Spaces & Tabs deck while on website
    await win.webContents.executeJavaScript(`
      (() => {
        const tabsBtn = document.querySelector('.macos-tabs-toggle-pill');
        if (tabsBtn) tabsBtn.click();
      })()
    `);
    await wait(900);

    const imgSiteTabsDeck = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_v5_site_tabs_deck_opened.png'), imgSiteTabsDeck.toPNG());
    console.log('4. Captured tabs deck opened on site');

    // 6. Light Mode Verification
    await win.webContents.executeJavaScript(`
      localStorage.setItem('neutrino_dark_theme', 'false');
      document.documentElement.setAttribute('data-theme', 'light');
      document.body.classList.remove('dark-mode');
    `);
    await wait(1200);

    const imgLightSite = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_v5_light_site_tabs_deck.png'), imgLightSite.toPNG());
    console.log('5. Captured light site with tabs deck');

    // Close deck in light mode to see revealed top chrome
    await win.webContents.executeJavaScript(`
      (() => {
        const tabsBtn = document.querySelector('.macos-tabs-toggle-pill');
        if (tabsBtn) tabsBtn.click();
      })()
    `);
    win.webContents.sendInputEvent({ type: 'mouseMove', x: 200, y: 10 });
    await wait(800);

    const imgLightRevealed = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_v5_light_top_revealed_opaque.png'), imgLightRevealed.toPNG());
    console.log('6. Captured light top revealed opaque');

    console.log('--- All verifications captured successfully! ---');
    app.quit();
  } catch (err) {
    console.error('Error during verification:', err);
    app.quit();
  }
});