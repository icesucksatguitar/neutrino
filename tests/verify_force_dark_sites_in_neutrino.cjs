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
    await wait(2000);

    // 1. Setup dark mode & Yash user
    await win.webContents.executeJavaScript(`
      localStorage.setItem('neutrino_welcome_completed', 'true');
      localStorage.setItem('neutrino_user_name', 'Yash');
      localStorage.setItem('neutrino_dark_theme', 'true');
      document.documentElement.setAttribute('data-theme', 'dark');
      document.body.classList.add('dark-mode');
    `);
    await wait(500);

    // 2. Navigate to pw.live (PhysicsWallah)
    console.log('Navigating to pw.live in Neutrino webview...');
    await win.webContents.executeJavaScript(`
      if (window.neutrino && window.neutrino.navigate) {
        window.neutrino.navigate('https://www.pw.live');
      }
    `);

    // Give webview time to load and DarkReader to apply
    await wait(7500);

    const imgDarkSite = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_v6_pw_live_dark_forced.png'), imgDarkSite.toPNG());
    console.log('1. Captured pw.live forced dark mode in Neutrino');

    // 3. Toggle to Light Theme
    console.log('Toggling to light mode...');
    await win.webContents.executeJavaScript(`
      (() => {
        const themeBtn = document.querySelector('[title*="Theme"]') || document.querySelector('.minimal-icon-btn:last-child');
        if (themeBtn) themeBtn.click();
      })()
    `);
    await wait(2500);

    const imgLightSite = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_v6_pw_live_light_restored.png'), imgLightSite.toPNG());
    console.log('2. Captured pw.live restored light mode in Neutrino');

    // 4. Toggle back to Dark Theme
    console.log('Toggling back to dark mode...');
    await win.webContents.executeJavaScript(`
      (() => {
        const themeBtn = document.querySelector('[title*="Theme"]') || document.querySelector('.minimal-icon-btn:last-child');
        if (themeBtn) themeBtn.click();
      })()
    `);
    await wait(2500);

    const imgDarkSiteReapplied = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_v6_pw_live_dark_reapplied.png'), imgDarkSiteReapplied.toPNG());
    console.log('3. Captured pw.live reapplied dark mode in Neutrino');

    console.log('--- ALL FORCED DARK THEME VERIFICATIONS COMPLETED! ---');
    app.quit();
  } catch (err) {
    console.error('Test error:', err);
    app.quit();
  }
});