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
        nodeIntegration: true,
        contextIsolation: false,
        webviewTag: true,
      },
    });

    const indexPath = path.join(__dirname, '..', 'dist-renderer', 'index.html');
    await win.loadFile(indexPath);

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    await wait(1800);

    // Setup state: Light mode
    await win.webContents.executeJavaScript(`
      localStorage.setItem('neutrino_welcome_completed', 'true');
      localStorage.setItem('neutrino_user_name', 'Yash');
      localStorage.setItem('neutrino_dark_theme', 'false');
      document.documentElement.setAttribute('data-theme', 'light');
      document.body.classList.remove('dark-mode');
      location.reload();
    `);
    await wait(2200);

    let imgLightHome = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_v4_macos_controls_light_home.png'), imgLightHome.toPNG());

    // Open tabs deck in light mode
    await win.webContents.executeJavaScript(`
      const tabsPill = document.querySelector('.macos-tabs-toggle-pill');
      if (tabsPill) tabsPill.click();
    `);
    await wait(1000);

    let imgLightDeck = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_v4_macos_controls_light_deck.png'), imgLightDeck.toPNG());

    console.log('--- Light Mode Verification Complete! ---');
    app.quit();
  } catch (err) {
    console.error('Test error:', err);
    app.quit();
  }
});
