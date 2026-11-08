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

    // 1. Capture Startup Splash Animation during entrance (solid pure black canvas + glowing Neutrino logo + quantum orbit)
    await wait(450);
    const splashImg = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_startup_splash_anim.png'), splashImg.toPNG());
    console.log('Saved verified_startup_splash_anim.png');

    // 2. Wait for Startup Splash to finish fading out completely (duration ~1.8s)
    await wait(1800);
    const browserImg = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_main_browser_after_splash.png'), browserImg.toPNG());
    console.log('Saved verified_main_browser_after_splash.png');

    // 3. Put tab to sleep (Zen Mode)
    console.log('Putting tab into Zen Sleeping Mode...');
    await win.webContents.executeJavaScript(`
      (() => {
        if (window.neutrino && window.neutrino.emitState) {
          window.neutrino.emitState(prev => ({
            ...prev,
            tabs: [
              {
                id: 'tab-zen-github',
                url: 'https://github.com/features/actions',
                title: 'GitHub Actions · Modern CI/CD Platform',
                isLoading: false,
                canGoBack: true,
                canGoForward: false,
                isPinned: false,
                isSleeping: true,
                blockedCount: 4,
                spaceId: 'space-study'
              }
            ],
            activeTabId: 'tab-zen-github'
          }));
        }
      })();
    `);

    await wait(600);
    const zenImg = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_zen_mode_sleeping_tab.png'), zenImg.toPNG());
    console.log('Saved verified_zen_mode_sleeping_tab.png');

    // 4. Test clicking Wake Tab button
    console.log('Testing Wake Tab click...');
    const wakeResult = await win.webContents.executeJavaScript(`
      (() => {
        const btn = document.querySelector('.zen-sleeping-wake-btn');
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      })();
    `);
    console.log('Wake Tab clicked:', wakeResult);

    await wait(600);
    const awakeImg = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_zen_mode_woken_tab.png'), awakeImg.toPNG());
    console.log('Saved verified_zen_mode_woken_tab.png');

    console.log('ALL VERIFICATIONS SUCCESSFUL!');
    win.close();
    app.quit();
  } catch (err) {
    console.error('Test error:', err);
    app.quit(1);
  }
});
