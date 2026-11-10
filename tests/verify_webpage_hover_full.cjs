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
      frame: false,
      show: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'test_preload.cjs'),
        webviewTag: true,
      },
    });

    const indexPath = path.join(__dirname, '..', 'dist-renderer', 'index.html');
    await win.loadFile(indexPath);

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    await wait(2000);

    // Initial setup
    await win.webContents.executeJavaScript(`
      localStorage.setItem('neutrino_welcome_completed', 'true');
      localStorage.setItem('neutrino_onboarding_completed', 'true');
      localStorage.setItem('neutrino_dark_theme', 'true');
      document.documentElement.setAttribute('data-theme', 'dark');
      document.body.classList.add('dark-mode');
    `);
    await wait(400);

    // 1. Initial State on newtab
    const newTabCheck = await win.webContents.executeJavaScript(`
      (() => {
        const capsule = document.querySelector('.floating-top-chrome-capsule');
        return {
          capsuleVisible: capsule ? capsule.classList.contains('visible') : false
        };
      })()
    `);
    console.log('1. NewTab Initial State:', newTabCheck);

    // 2. Navigate to https://www.pw.live
    console.log('2. Navigating to https://www.pw.live...');
    await win.webContents.executeJavaScript(`
      if (window.neutrino?.navigate) {
        window.neutrino.navigate('https://www.pw.live');
      }
    `);
    await wait(1000);

    // 3. Inspect webpage state: Top bar should be autohidden, top hover zone should exist
    const webpageCheck = await win.webContents.executeJavaScript(`
      (() => {
        const capsule = document.querySelector('.floating-top-chrome-capsule');
        const hoverZone = document.querySelector('.top-edge-hover-zone');
        const dragBar = document.querySelector('.macos-window-drag-bar');

        const hoverStyle = hoverZone ? window.getComputedStyle(hoverZone) : null;

        return {
          capsuleAutohidden: capsule ? capsule.classList.contains('autohidden') : false,
          hasHoverZone: Boolean(hoverZone),
          hoverZoneHeight: hoverStyle ? hoverStyle.height : null,
          hoverZoneZIndex: hoverStyle ? hoverStyle.zIndex : null,
          noDragBarBlockingSite: dragBar === null
        };
      })()
    `);
    console.log('3. Webpage Autohidden & Hover Zone Check:', webpageCheck);

    // 4. Hover the top edge trigger zone
    console.log('4. Hovering top edge trigger zone...');
    await win.webContents.executeJavaScript(`
      const hoverZone = document.querySelector('.top-edge-hover-zone');
      if (hoverZone) {
        hoverZone.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientY: 5 }));
        hoverZone.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientY: 5 }));
      }
    `);
    await wait(400);

    // 5. Inspect revealed top controls
    const revealedCheck = await win.webContents.executeJavaScript(`
      (() => {
        const capsule = document.querySelector('.floating-top-chrome-capsule');
        const windowControls = document.querySelector('.macos-window-controls-cluster');
        const tabsPill = document.querySelector('.macos-tabs-toggle-pill');
        const urlPill = document.querySelector('.top-floating-url-pill');
        const aiControls = document.querySelector('.minimal-top-right-cluster');
        const sparklesBtn = aiControls ? aiControls.querySelector('button[aria-label="AI Assistants & Tools"]') : null;

        const capsuleStyle = capsule ? window.getComputedStyle(capsule) : null;
        const windowControlsStyle = windowControls ? window.getComputedStyle(windowControls) : null;
        const aiControlsStyle = aiControls ? window.getComputedStyle(aiControls) : null;
        const urlPillStyle = urlPill ? window.getComputedStyle(urlPill) : null;

        return {
          capsuleVisibleAfterHover: capsule ? capsule.classList.contains('visible') : false,
          capsuleZIndex: capsuleStyle ? capsuleStyle.zIndex : null,
          windowControlsZIndex: windowControlsStyle ? windowControlsStyle.zIndex : null,
          windowControlsNoDrag: windowControlsStyle ? windowControlsStyle.webkitAppRegion : null,
          aiControlsZIndex: aiControlsStyle ? aiControlsStyle.zIndex : null,
          aiControlsNoDrag: aiControlsStyle ? aiControlsStyle.webkitAppRegion : null,
          hasSparklesBtn: Boolean(sparklesBtn),
          urlPillNoDrag: urlPillStyle ? urlPillStyle.webkitAppRegion : null
        };
      })()
    `);
    console.log('5. Top Bar Revealed & Interactive Check:', revealedCheck);

    // 6. Click Sparkles (AI modal)
    console.log('6. Clicking Sparkles (AI Assistant Modal)...');
    await win.webContents.executeJavaScript(`
      const sparklesBtn = document.querySelector('.minimal-top-right-cluster button[aria-label="AI Assistants & Tools"]');
      if (sparklesBtn) {
        sparklesBtn.click();
      }
    `);
    await wait(500);

    const modalCheck = await win.webContents.executeJavaScript(`
      (() => {
        const modal = document.querySelector('.mcp-modal-card');
        const capsule = document.querySelector('.floating-top-chrome-capsule');
        return {
          isMcpModalOpen: Boolean(modal),
          capsuleStillVisible: capsule ? capsule.classList.contains('visible') : false
        };
      })()
    `);
    console.log('6. AI Modal & Top Capsule Persistence Check:', modalCheck);

    // Take verified screenshot
    const image = await win.capturePage();
    const outPath = path.join(ARTIFACT_DIR, 'verified_top_bar_hover_full.png');
    fs.writeFileSync(outPath, image.toPNG());
    console.log('Saved screenshot to:', outPath);

    app.quit();
  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  }
});
