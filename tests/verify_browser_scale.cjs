const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\simpl\\.gemini\\antigravity\\brain\\5ab3cecc-0f9a-4067-a03a-0ad1710d3f7c';

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      width: 1920,
      height: 1080,
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
    await wait(2200);

    console.log('=== 1. Testing Dark Mode & Milky Way Galaxy Scaling ===');
    // Toggle dark mode
    await win.webContents.executeJavaScript(`
      document.documentElement.setAttribute('data-theme', 'dark');
      document.body.classList.add('dark-mode');
      localStorage.setItem('neutrino_dark_theme', 'true');
    `);
    await wait(1500);

    const darkModeMetrics = await win.webContents.executeJavaScript(`
      (() => {
        const sidebar = document.querySelector('.arc-sidebar');
        const tabSquircle = document.querySelector('.arc-macos-tab-squircle');
        const tabTitle = document.querySelector('.arc-macos-tab-app-name');
        const topBtns = document.querySelectorAll('.arc-top-right-btn');
        const topPills = document.querySelectorAll('.arc-top-right-pill-btn');
        const searchBox = document.querySelector('.homescreen-glass-search-box');
        const wordmark = document.querySelector('.homescreen-wordmark');
        const searchInput = document.querySelector('.homescreen-glass-input');

        return {
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
          sidebarWidth: sidebar ? sidebar.getBoundingClientRect().width : null,
          tabSquircleSize: tabSquircle ? tabSquircle.getBoundingClientRect().width : null,
          tabTitleFontSize: tabTitle ? window.getComputedStyle(tabTitle).fontSize : null,
          topBtnCount: topBtns.length,
          topBtnWidth: topBtns[0] ? topBtns[0].getBoundingClientRect().width : null,
          topBtnHeight: topBtns[0] ? topBtns[0].getBoundingClientRect().height : null,
          topPillHeight: topPills[0] ? topPills[0].getBoundingClientRect().height : null,
          searchBoxWidth: searchBox ? searchBox.getBoundingClientRect().width : null,
          searchBoxHeight: searchBox ? searchBox.getBoundingClientRect().height : null,
          wordmarkFontSize: wordmark ? window.getComputedStyle(wordmark).fontSize : null,
          searchInputFontSize: searchInput ? window.getComputedStyle(searchInput).fontSize : null,
        };
      })()
    `);
    console.log('Dark Mode UI Scale Metrics:', darkModeMetrics);

    const darkImg = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_scale_dark_galaxy_1920x1080.png'), darkImg.toPNG());

    console.log('=== 2. Testing Light Mode & Sumi-e Black Tree Scaling ===');
    await win.webContents.executeJavaScript(`
      document.documentElement.setAttribute('data-theme', 'light');
      document.body.classList.remove('dark-mode');
      localStorage.setItem('neutrino_dark_theme', 'false');
    `);
    await wait(1500);

    const lightModeMetrics = await win.webContents.executeJavaScript(`
      (() => {
        const sidebar = document.querySelector('.arc-sidebar');
        const searchBox = document.querySelector('.homescreen-glass-search-box');
        const wordmark = document.querySelector('.homescreen-wordmark');
        return {
          sidebarWidth: sidebar ? sidebar.getBoundingClientRect().width : null,
          searchBoxWidth: searchBox ? searchBox.getBoundingClientRect().width : null,
          searchBoxHeight: searchBox ? searchBox.getBoundingClientRect().height : null,
          wordmarkFontSize: wordmark ? window.getComputedStyle(wordmark).fontSize : null,
        };
      })()
    `);
    console.log('Light Mode UI Scale Metrics:', lightModeMetrics);

    const lightImg = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_scale_light_tree_1920x1080.png'), lightImg.toPNG());

    console.log('=== 3. Testing Zoom & Scale Event ===');
    await win.webContents.executeJavaScript(`
      window.dispatchEvent(new CustomEvent('neutrino:scale-change', { detail: { scale: 1.25 } }));
    `);
    await wait(800);

    const zoomedImg = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_scale_zoomed_125_1920x1080.png'), zoomedImg.toPNG());

    console.log('All verification screenshots captured successfully!');
    win.destroy();
    app.quit();
  } catch (err) {
    console.error('Scale verification error:', err);
    process.exit(1);
  }
});

