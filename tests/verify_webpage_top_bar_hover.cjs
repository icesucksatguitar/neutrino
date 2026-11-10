const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

async function run() {
  await app.whenReady();
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'dist-main', 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  const distPath = path.join(__dirname, '..', 'dist-renderer', 'index.html');
  await win.loadFile(distPath);
  await new Promise(r => setTimeout(r, 1800));

  const testSteps = await win.webContents.executeJavaScript(`
    (async () => {
      // 1. Initial State (New Tab)
      const initialCapsuleVisible = document.querySelector('.floating-top-chrome-capsule')?.classList.contains('visible');

      // 2. Simulate navigating to a webpage (e.g. YouTube or PW) by emitting state update via neutrino IPC
      // Send neutrino:state-update with a webpage URL
      const { ipcRenderer } = require('electron');
      const webState = {
        spaces: [
          { id: 'space-study', name: 'Study', icon: 'BookOpen', color: '#E4E4E7' }
        ],
        activeSpaceId: 'space-study',
        tabs: [
          {
            id: 'tab-web',
            spaceId: 'space-study',
            title: 'YouTube',
            url: 'https://youtube.com',
            isLoading: false,
            canGoBack: true,
            canGoForward: false,
            isPinned: false,
            isSleeping: false,
            blockedCount: 3,
          }
        ],
        activeTabId: 'tab-web',
        shieldStats: { totalBlocked: 5, adsBlocked: 3, trackersBlocked: 2 },
        resourceStats: { memorySavedMb: 120, sleepingCount: 0 }
      };

      ipcRenderer.emit('neutrino:state-update', null, webState);
      await new Promise(r => setTimeout(r, 500));

      const hoverZoneBefore = document.querySelector('.top-edge-hover-zone');
      const capsuleOnPage = document.querySelector('.floating-top-chrome-capsule');
      const isAutohiddenInitially = capsuleOnPage?.classList.contains('autohidden');
      const dragBarOnPage = document.querySelector('.macos-window-drag-bar');

      // 3. Simulate mouse hovering the top edge trigger zone
      if (hoverZoneBefore) {
        hoverZoneBefore.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientY: 5 }));
      }
      
      await new Promise(r => setTimeout(r, 200));

      const capsuleAfterHover = document.querySelector('.floating-top-chrome-capsule');
      const isRevealedAfterHover = capsuleAfterHover?.classList.contains('visible');

      // 4. Check interactive buttons inside revealed top bar
      const sparklesBtn = document.querySelector('.minimal-top-right-cluster button[aria-label="AI Assistants & Tools"]');
      const trafficLights = document.querySelector('.macos-traffic-lights');
      const tabsPill = document.querySelector('.macos-tabs-toggle-pill');
      const urlPill = document.querySelector('.top-floating-url-pill');

      // 5. Click Sparkles (AI modal)
      if (sparklesBtn) {
        sparklesBtn.click();
      }

      await new Promise(r => setTimeout(r, 400));

      const isMcpModalOpen = Boolean(document.querySelector('.mcp-modal-card'));
      const isCapsuleStillVisibleWithModal = document.querySelector('.floating-top-chrome-capsule')?.classList.contains('visible');

      return {
        initialCapsuleVisible,
        hasHoverZoneOnWebpage: Boolean(hoverZoneBefore),
        hoverZoneHeight: hoverZoneBefore ? window.getComputedStyle(hoverZoneBefore).height : null,
        hoverZoneZIndex: hoverZoneBefore ? window.getComputedStyle(hoverZoneBefore).zIndex : null,
        isAutohiddenInitially,
        noDragBarBlockingSite: dragBarOnPage === null,
        isRevealedAfterHover,
        hasSparklesBtn: Boolean(sparklesBtn),
        hasTrafficLights: Boolean(trafficLights),
        hasTabsPill: Boolean(tabsPill),
        hasUrlPill: Boolean(urlPill),
        isMcpModalOpen,
        isCapsuleStillVisibleWithModal
      };
    })()
  `);

  console.log('--- Webpage Top Bar & AI Controls Hover Results ---');
  console.log(JSON.stringify(testSteps, null, 2));

  // Save screenshot of revealed top bar with AI drawer/modal
  const image = await win.capturePage();
  const artifactDir = 'C:\\Users\\simpl\\.gemini\\antigravity\\brain\\5ab3cecc-0f9a-4067-a03a-0ad1710d3f7c';
  const outPath = path.join(artifactDir, 'verified_webpage_top_bar_hover_and_ai.png');
  fs.writeFileSync(outPath, image.toPNG());
  console.log('Saved screenshot to:', outPath);

  app.quit();
}

run().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
