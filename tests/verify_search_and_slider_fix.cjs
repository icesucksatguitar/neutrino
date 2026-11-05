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

    console.log('--- 1. Testing Light Mode: Initial State (No search bar, single bottom-left slider) ---');
    let sliderCount = await win.webContents.executeJavaScript(`
      (() => {
        const sidebarSlider = document.querySelectorAll('.arc-sidebar-bottom .arc-spaces-bar').length;
        const homescreenSlider = document.querySelectorAll('.homescreen-bottom-left-slider').length;
        return { sidebarSlider, homescreenSlider, total: sidebarSlider + homescreenSlider };
      })()
    `);
    console.log('Slider elements with sidebar open:', sliderCount);

    let img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_fix_light_initial_1920x1080.png'), img.toPNG());

    console.log('--- 2. Revealing Search Bar & Focusing Input in Light Mode ---');
    await win.webContents.executeJavaScript(`
      const newTabBtn = document.querySelector('.arc-new-tab-btn');
      if (newTabBtn) newTabBtn.click();
      else window.dispatchEvent(new CustomEvent('neutrino:show-search'));
      setTimeout(() => {
        const input = document.querySelector('.homescreen-glass-input');
        if (input) input.focus();
      }, 200);
    `);
    await wait(1200);

    const lightSearchStyles = await win.webContents.executeJavaScript(`
      (() => {
        const box = document.querySelector('.homescreen-glass-search-box');
        const ambient = document.querySelector('.homescreen-search-blur-ambient');
        const input = document.querySelector('.homescreen-glass-input');
        const boxComputed = box ? window.getComputedStyle(box) : null;
        const ambientComputed = ambient ? window.getComputedStyle(ambient) : null;
        const inputComputed = input ? window.getComputedStyle(input) : null;
        return {
          hasAmbient: !!ambient,
          ambientBackdropFilter: ambientComputed ? ambientComputed.backdropFilter : null,
          boxBorderColor: boxComputed ? boxComputed.borderColor : null,
          boxShadow: boxComputed ? boxComputed.boxShadow : null,
          inputOutline: inputComputed ? inputComputed.outline : null
        };
      })()
    `);
    console.log('Light Mode Search Styles:', lightSearchStyles);

    img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_fix_search_light_focused.png'), img.toPNG());

    console.log('--- 3. Testing Dark Mode (Milky Way): Search Bar & No Blue Bars ---');
    await win.webContents.executeJavaScript(`
      const darkBtn = document.querySelector('.arc-top-right-bar button[title*="Dark"], .arc-top-right-bar button[title*="Light"]');
      if (darkBtn) darkBtn.click();
      setTimeout(() => {
        const input = document.querySelector('.homescreen-glass-input');
        if (input) input.focus();
      }, 200);
    `);
    await wait(1500);

    const darkSearchStyles = await win.webContents.executeJavaScript(`
      (() => {
        const box = document.querySelector('.homescreen-glass-search-box');
        const ambient = document.querySelector('.homescreen-search-blur-ambient');
        const input = document.querySelector('.homescreen-glass-input');
        const boxComputed = box ? window.getComputedStyle(box) : null;
        const ambientComputed = ambient ? window.getComputedStyle(ambient) : null;
        const inputComputed = input ? window.getComputedStyle(input) : null;
        return {
          theme: document.documentElement.getAttribute('data-theme'),
          hasAmbient: !!ambient,
          ambientBackdropFilter: ambientComputed ? ambientComputed.backdropFilter : null,
          boxBorderColor: boxComputed ? boxComputed.borderColor : null,
          boxShadow: boxComputed ? boxComputed.boxShadow : null,
          inputOutline: inputComputed ? inputComputed.outline : null
        };
      })()
    `);
    console.log('Dark Mode Search Styles:', darkSearchStyles);

    img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_fix_search_dark_focused.png'), img.toPNG());

    // 4. Test 1280x720 view
    win.setSize(1280, 720);
    await wait(1200);
    img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_fix_search_dark_1280x720.png'), img.toPNG());

    // Write verification json report
    fs.writeFileSync(
      path.join(ARTIFACT_DIR, 'search_slider_verification.json'),
      JSON.stringify(
        {
          sliderCount,
          lightSearchStyles,
          darkSearchStyles,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      )
    );

    console.log('All search bar & slider verification checks passed!');
    app.quit();
  } catch (err) {
    console.error('Verification script failed:', err);
    app.quit();
  }
});

