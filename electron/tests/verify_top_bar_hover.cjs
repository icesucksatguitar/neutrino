const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

async function run() {
  await app.whenReady();
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'dist-main', 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  const distPath = path.join(__dirname, '..', 'dist-renderer', 'index.html');
  await win.loadFile(distPath);
  await new Promise(r => setTimeout(r, 2000));

  const result = await win.webContents.executeJavaScript(`
    (() => {
      const topHoverZone = document.querySelector('.top-edge-hover-zone');
      const capsule = document.querySelector('.floating-top-chrome-capsule');
      const windowControls = document.querySelector('.macos-window-controls-cluster');
      const tabsPill = document.querySelector('.macos-tabs-toggle-pill');
      const urlPill = document.querySelector('.top-floating-url-pill');
      const aiControls = document.querySelector('.minimal-top-right-cluster');
      const sparklesBtn = aiControls ? aiControls.querySelector('button[title*="AI Assistants"]') : null;

      // Compute styles
      const capsuleStyle = capsule ? window.getComputedStyle(capsule) : null;
      const windowControlsStyle = windowControls ? window.getComputedStyle(windowControls) : null;
      const aiControlsStyle = aiControls ? window.getComputedStyle(aiControls) : null;
      const urlPillStyle = urlPill ? window.getComputedStyle(urlPill) : null;

      return {
        hasCapsule: Boolean(capsule),
        capsuleVisible: capsule ? capsule.classList.contains('visible') : false,
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

  console.log('--- Top Bar & AI Controls Verification Results ---');
  console.log(JSON.stringify(result, null, 2));

  // Take screenshot for visual verification
  const image = await win.capturePage();
  const artifactDir = 'C:\\Users\\simpl\\.gemini\\antigravity\\brain\\5ab3cecc-0f9a-4067-a03a-0ad1710d3f7c';
  const outPath = path.join(artifactDir, 'verified_top_bar_and_ai_controls.png');
  fs.writeFileSync(outPath, image.toPNG());
  console.log('Saved screenshot to:', outPath);

  app.quit();
}

run().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
