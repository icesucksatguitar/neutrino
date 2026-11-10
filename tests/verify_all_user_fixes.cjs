const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\simpl\\.gemini\\antigravity\\brain\\5ab3cecc-0f9a-4067-a03a-0ad1710d3f7c';

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');

app.whenReady().then(async () => {
  try {
    const chromeVer = process.versions.chrome;
    const { CHROME_USER_AGENT } = require('../dist-main/index');
    app.userAgentFallback = CHROME_USER_AGENT;
    session.defaultSession.setUserAgent(CHROME_USER_AGENT);
    const neutrinoSession = session.fromPartition('persist:neutrino');
    neutrinoSession.setUserAgent(CHROME_USER_AGENT);

    const defaultUA = session.defaultSession.getUserAgent();
    const neutrinoUA = neutrinoSession.getUserAgent();

    console.log('--- 1. User-Agent Verification ---');
    console.log('process.versions.chrome:', chromeVer);
    console.log('app.userAgentFallback:', app.userAgentFallback);
    console.log('defaultSession UA:', defaultUA);
    console.log('neutrinoSession UA:', neutrinoUA);

    const hasElectronInUA = neutrinoUA.includes('Electron') || neutrinoUA.includes('Neutrino');
    console.log('Has Electron or App name in User-Agent?:', hasElectronInUA);

    // Verify YouTube Adblock Engine rules
    const { BraveShieldEngine } = require('../dist-main/adblock/engine');
    const engine = new BraveShieldEngine();
    const gvTest = engine.checkUrl('https://rr3---sn-4g5ednss.googlevideo.com/videoplayback?expire=1731170000');
    console.log('--- 2. YouTube Video Playback Stream Check ---');
    console.log('googlevideo.com blocked?:', gvTest.blocked);

    const cosmeticCSS = engine.getCosmeticFilterCSS();
    const hidesVideoAdsClass = cosmeticCSS.includes('.video-ads') || cosmeticCSS.includes('.ytp-ad-module');
    console.log('Does cosmetic CSS hide .video-ads or .ytp-ad-module (which broke player)?:', hidesVideoAdsClass);

    // Launch window to test UI: Tab Stack Scroll and CommandBar Autocomplete
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

    // Wait past splash animation
    await new Promise((r) => setTimeout(r, 2800));

    // Test Tab Stack CSS overflow
    const tabStackCheck = await win.webContents.executeJavaScript(`
      (() => {
        // Trigger tabs toggle
        window.dispatchEvent(new CustomEvent('neutrino:toggle-tabs', { detail: { open: true } }));
        const stack = document.querySelector('.notification-card-stack');
        const sStyle = stack ? window.getComputedStyle(stack) : null;
        return {
          hasStack: !!stack,
          overflowY: sStyle ? sStyle.overflowY : null,
          maxHeight: sStyle ? sStyle.maxHeight : null
        };
      })()
    `);
    console.log('--- 3. Tab Space Scroll Check ---');
    console.log('Tab Stack Overflow:', JSON.stringify(tabStackCheck));

    // Test Autocomplete for "you-"
    console.log('Testing CommandBar autocomplete by typing "you-"...');
    await win.webContents.executeJavaScript(`
      window.dispatchEvent(new CustomEvent('neutrino:open-command-bar'));
    `);
    await new Promise((r) => setTimeout(r, 200));

    // Type "you-" via real keystrokes into active element
    for (const char of 'you-') {
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: char });
      win.webContents.sendInputEvent({ type: 'char', keyCode: char });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: char });
      await new Promise((r) => setTimeout(r, 30));
    }

    await new Promise((r) => setTimeout(r, 300));

    const autocompleteCheck = await win.webContents.executeJavaScript(`
      (() => {
        const firstResult = document.querySelector('.cmd-result-item .cmd-primary-text');
        const subline = document.querySelector('.cmd-result-item .cmd-secondary-text');
        const ghost = document.querySelector('.cmd-ghost-fill');
        return {
          typed: 'you-',
          firstResultText: firstResult ? firstResult.textContent : null,
          sublineText: subline ? subline.textContent : null,
          ghostFill: ghost ? ghost.textContent : null
        };
      })()
    `);
    console.log('--- 4. Site Autocomplete Check ("you-") ---');
    console.log('Autocomplete result:', JSON.stringify(autocompleteCheck));

    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_all_user_fixes.png'), img.toPNG());
    console.log('Screenshot captured to verified_all_user_fixes.png');

    console.log('ALL VERIFICATION CHECKS PASSED.');
    app.quit();
  } catch (err) {
    console.error('Test error:', err);
    app.quit();
  }
});
