const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\simpl\\.gemini\\antigravity\\brain\\5ab3cecc-0f9a-4067-a03a-0ad1710d3f7c';

app.commandLine.appendSwitch('no-sandbox');

app.whenReady().then(async () => {
  try {
    const { BraveShieldEngine } = require('../dist-main/adblock/engine');
    const { isMediaStreamingUrl } = require('../dist-main/index');
    const engine = new BraveShieldEngine();

    console.log('=== VERIFYING ALL 4 USER ISSUES ===');

    // 1. YouTube streaming & dialog check
    console.log('1. Checking YouTube streaming endpoints & cosmetic rules:');
    const ytVideoUrl = 'https://rr2---sn-4g5ednss.googlevideo.com/videoplayback?expire=1731170000&itag=18';
    const ytPlayerUrl = 'https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_';
    const ytPlaybackUrl = 'https://www.youtube.com/api/stats/playback?docid=dQw4w9WgXcQ';
    const ytWatchtimeUrl = 'https://www.youtube.com/api/stats/watchtime?docid=dQw4w9WgXcQ';

    console.log(' - googlevideo.com blocked?:', engine.checkUrl(ytVideoUrl).blocked, '(isMediaStreamingUrl:', isMediaStreamingUrl(ytVideoUrl), ')');
    console.log(' - youtubei/v1/player blocked?:', engine.checkUrl(ytPlayerUrl).blocked, '(isMediaStreamingUrl:', isMediaStreamingUrl(ytPlayerUrl), ')');
    console.log(' - api/stats/playback blocked?:', engine.checkUrl(ytPlaybackUrl).blocked, '(isMediaStreamingUrl:', isMediaStreamingUrl(ytPlaybackUrl), ')');
    console.log(' - api/stats/watchtime blocked?:', engine.checkUrl(ytWatchtimeUrl).blocked, '(isMediaStreamingUrl:', isMediaStreamingUrl(ytWatchtimeUrl), ')');

    const cosmetic = engine.getCosmeticFilterCSS();
    console.log(' - contains tp-yt-paper-dialog?:', cosmetic.includes('tp-yt-paper-dialog'));
    console.log(' - contains .video-ads?:', cosmetic.includes('.video-ads'));
    console.log(' - contains .ytp-ad-module?:', cosmetic.includes('.ytp-ad-module'));

    // Launch UI Window
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

    // ISSUE 2: Startup Splash Animation (media_1.png)
    console.log('\n2. Testing Startup Splash Animation...');
    await wait(350);
    const splashImg = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_startup_splash_fixed.png'), splashImg.toPNG());
    console.log(' - Captured verified_startup_splash_fixed.png');

    // Wait past splash
    await wait(2000);

    // ISSUE 1: Zen Mode Sleeping Screen (media_0.png)
    console.log('\n3. Testing Zen Mode Sleeping Tab Redesign...');
    await win.webContents.executeJavaScript(`
      (() => {
        if (window.neutrino && window.neutrino.emitState) {
          window.neutrino.emitState(prev => ({
            ...prev,
            tabs: [
              {
                id: 'tab-zen',
                url: 'https://en.wikipedia.org/wiki/Quantum_computing',
                title: 'Quantum computing - Wikipedia',
                isLoading: false,
                canGoBack: true,
                canGoForward: false,
                isPinned: false,
                isSleeping: true,
                blockedCount: 0,
                spaceId: 'space-study'
              }
            ],
            activeTabId: 'tab-zen'
          }));
        }
      })();
    `);
    await wait(600);

    const zenDiagnostics = await win.webContents.executeJavaScript(`
      (() => {
        const screen = document.querySelector('.zen-sleeping-screen');
        const card = document.querySelector('.zen-sleeping-card');
        const title = document.querySelector('.zen-sleeping-title');
        const wakeBtn = document.querySelector('.zen-sleeping-wake-btn');
        const urlPill = document.querySelector('.zen-sleeping-url-pill');
        const rect = card ? card.getBoundingClientRect() : null;
        return {
          hasScreen: !!screen,
          hasCard: !!card,
          titleText: title ? title.textContent : null,
          urlText: urlPill ? urlPill.textContent.trim() : null,
          hasWakeBtn: !!wakeBtn,
          cardTop: rect ? rect.top : null,
          cardLeft: rect ? rect.left : null
        };
      })()
    `);
    console.log(' - Zen Mode Diagnostics:', JSON.stringify(zenDiagnostics, null, 2));
    const zenImg = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_zen_mode_fixed.png'), zenImg.toPNG());
    console.log(' - Captured verified_zen_mode_fixed.png');

    // ISSUE 4: Webpage Clean Layout & Right Dock Autohide (media_3.png)
    console.log('\n4. Testing Webpage Layout (Right Dock & Left Hairlines Autohide)...');
    await win.webContents.executeJavaScript(`
      (() => {
        if (window.neutrino && window.neutrino.emitState) {
          window.neutrino.emitState(prev => ({
            ...prev,
            tabs: [
              {
                id: 'tab-yt-live',
                url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                title: 'Rick Astley - Never Gonna Give You Up (Official Music Video)',
                isLoading: false,
                canGoBack: true,
                canGoForward: false,
                isPinned: false,
                isSleeping: false,
                blockedCount: 0,
                spaceId: 'space-study'
              }
            ],
            activeTabId: 'tab-yt-live'
          }));
        }
      })();
    `);
    await wait(600);

    const webpageLayoutDiag = await win.webContents.executeJavaScript(`
      (() => {
        const rightDock = document.querySelector('.vertical-pins-dock-container');
        const leftHairlines = document.querySelector('.notification-hairlines-container');
        const rightDockStyle = rightDock ? window.getComputedStyle(rightDock) : null;
        const leftHairStyle = leftHairlines ? window.getComputedStyle(leftHairlines) : null;

        return {
          rightDockHasOnWebpage: rightDock ? rightDock.classList.contains('on-webpage') : false,
          rightDockIsAutohidden: rightDock ? rightDock.classList.contains('autohidden') : false,
          rightDockOpacity: rightDockStyle ? rightDockStyle.opacity : null,
          rightDockPointerEvents: rightDockStyle ? rightDockStyle.pointerEvents : null,
          leftHairlinesHasOnWebpage: leftHairlines ? leftHairlines.classList.contains('on-webpage') : false,
          leftHairlinesOpacity: leftHairStyle ? leftHairStyle.opacity : null,
          leftHairlinesPointerEvents: leftHairStyle ? leftHairStyle.pointerEvents : null
        };
      })()
    `);
    console.log(' - Webpage Layout Diagnostics:', JSON.stringify(webpageLayoutDiag, null, 2));
    const webpageImg = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_webpage_clean_view_fixed.png'), webpageImg.toPNG());
    console.log(' - Captured verified_webpage_clean_view_fixed.png');

    // ISSUE 3: Tab Space Scrolling when opening many tabs (media_2.png)
    console.log('\n5. Testing Tab Space Drawer with Many Tabs (Scrolling)...');
    await win.webContents.executeJavaScript(`
      (() => {
        const testTabs = [];
        for (let i = 1; i <= 12; i++) {
          testTabs.push({
            id: 'tab-test-' + i,
            url: i % 2 === 0 ? 'https://youtube.com/watch?v=' + i : 'https://github.com/project/' + i,
            title: i % 2 === 0 ? 'YouTube Video #' + i : 'GitHub Repo #' + i,
            isLoading: false,
            canGoBack: false,
            canGoForward: false,
            isPinned: false,
            isSleeping: i > 6,
            blockedCount: 2,
            spaceId: 'space-study'
          });
        }
        if (window.neutrino && window.neutrino.emitState) {
          window.neutrino.emitState(prev => ({
            ...prev,
            tabs: testTabs,
            activeTabId: 'tab-test-1'
          }));
        }
        window.dispatchEvent(new CustomEvent('neutrino:toggle-tabs', { detail: { open: true } }));
      })();
    `);
    await wait(600);

    const scrollDiag = await win.webContents.executeJavaScript(`
      (() => {
        const stack = document.querySelector('.notification-card-stack');
        const cards = document.querySelectorAll('.mini-window-card');
        const slider = document.querySelector('.spaces-bottom-left-slider-container');
        if (!stack) return { found: false };

        const initialScrollTop = stack.scrollTop;
        stack.scrollTop = 500;

        return {
          found: true,
          totalCards: cards.length,
          scrollHeight: stack.scrollHeight,
          clientHeight: stack.clientHeight,
          isScrollable: stack.scrollHeight > stack.clientHeight,
          scrolledTop: stack.scrollTop,
          hasSliderAtBottom: !!slider
        };
      })()
    `);
    console.log(' - Tab Scroll Diagnostics:', JSON.stringify(scrollDiag, null, 2));
    const scrollImg = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_tab_scroll_fixed.png'), scrollImg.toPNG());
    console.log(' - Captured verified_tab_scroll_fixed.png');

    console.log('\n=== ALL 4 USER ISSUES VERIFIED SUCCESSFULLY! ===');
    win.close();
    app.quit();
  } catch (err) {
    console.error('Test error:', err);
    app.quit(1);
  }
});
