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

    // Setup initial state: User Yash, dark mode, welcome complete
    await win.webContents.executeJavaScript(`
      localStorage.setItem('neutrino_welcome_completed', 'true');
      localStorage.setItem('neutrino_user_name', 'Yash');
      localStorage.setItem('neutrino_dark_theme', 'true');
      localStorage.removeItem('neutrino_simple_theme_v5');
      document.documentElement.setAttribute('data-theme', 'dark');
      document.body.classList.add('dark-mode');
      location.reload();
    `);
    await wait(2200);

    console.log('--- 1. Testing Dark Theme Pitch Black & Greeting Visibility ---');
    const darkInfo = await win.webContents.executeJavaScript(`
      (() => {
        const greeting = document.querySelector('.yc-italic-greeting');
        const clockDigits = document.querySelector('.compact-clock .digital-clock-digits');
        const newtab = document.querySelector('.neutrino-minimal-newtab');
        const body = document.body;
        return {
          greetingText: greeting ? greeting.textContent : null,
          greetingColor: greeting ? window.getComputedStyle(greeting).color : null,
          digitsColor: clockDigits ? window.getComputedStyle(clockDigits).color : null,
          newtabBg: newtab ? window.getComputedStyle(newtab).backgroundColor : null,
          bodyBg: body ? window.getComputedStyle(body).backgroundColor : null,
        };
      })()
    `);
    console.log('Dark Theme Info:', darkInfo);

    let img1 = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_v3_dark_pitch_black.png'), img1.toPNG());

    console.log('--- 2. Testing AI & MCP Window Slider & Local Models Tab ---');
    // Open MCP Modal via aria-label
    await win.webContents.executeJavaScript(`
      const mcpBtn = document.querySelector('button[aria-label="AI Assistants & Tools"]');
      if (mcpBtn) mcpBtn.click();
    `);
    await wait(1200);

    // Switch to Local models tab using the new slider tab button
    await win.webContents.executeJavaScript(`
      const localTabBtn = document.querySelectorAll('.mcp-slider-tab-btn')[1];
      if (localTabBtn) localTabBtn.click();
    `);
    await wait(1000);

    const mcpInfo = await win.webContents.executeJavaScript(`
      (() => {
        const greeting = document.querySelector('.mcp-greeting-text');
        const sliderPill = document.querySelector('.mcp-tab-slider-pill');
        const indicators = Array.from(document.querySelectorAll('.runtime-indicator')).map(el => el.textContent.trim());
        const noRuntimeTitle = document.querySelector('.no-runtime-title')?.textContent;
        const noRuntimeCardBg = window.getComputedStyle(document.querySelector('.no-runtime-card')).backgroundColor;
        return {
          greeting: greeting ? greeting.textContent : null,
          pillTransform: sliderPill ? sliderPill.style.transform : null,
          indicators,
          noRuntimeTitle,
          noRuntimeCardBg,
        };
      })()
    `);
    console.log('MCP Modal Info:', mcpInfo);

    let img2 = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_v3_mcp_local_models_slider.png'), img2.toPNG());

    // Switch to Tools tab to test 2nd slider translation
    await win.webContents.executeJavaScript(`
      const toolsTabBtn = document.querySelectorAll('.mcp-slider-tab-btn')[2];
      if (toolsTabBtn) toolsTabBtn.click();
    `);
    await wait(800);
    let img2_tools = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_v3_mcp_tools_slider.png'), img2_tools.toPNG());

    // Close MCP Modal
    await win.webContents.executeJavaScript(`
      const closeBtn = document.querySelector('.mcp-drawer-close-btn');
      if (closeBtn) closeBtn.click();
    `);
    await wait(600);

    console.log('--- 3. Testing Warm Light Theme ---');
    await win.webContents.executeJavaScript(`
      const themeToggleBtn = document.querySelector('button[title*="Light Mode"]') || document.querySelector('button[aria-label="Toggle Dark Mode"]');
      if (themeToggleBtn) themeToggleBtn.click();
    `);
    await wait(1200);

    const lightInfo = await win.webContents.executeJavaScript(`
      (() => {
        const greeting = document.querySelector('.yc-italic-greeting');
        const digits = document.querySelector('.compact-clock .digital-clock-digits');
        const newtab = document.querySelector('.neutrino-minimal-newtab');
        return {
          greetingColor: greeting ? window.getComputedStyle(greeting).color : null,
          digitsColor: digits ? window.getComputedStyle(digits).color : null,
          newtabBg: newtab ? window.getComputedStyle(newtab).backgroundColor : null,
        };
      })()
    `);
    console.log('Warm Light Info:', lightInfo);

    let img3 = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_v3_warm_light_theme.png'), img3.toPNG());

    console.log('--- 4. Testing Notification Tabs Deck with Spaces Slider ---');
    await win.webContents.executeJavaScript(`
      const deckCapsule = document.querySelector('.deck-toggle-capsule');
      if (deckCapsule) deckCapsule.click();
    `);
    await wait(1200);

    let img4 = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_v3_tab_deck_slider.png'), img4.toPNG());

    console.log('Verification completed successfully!');
  } catch (err) {
    console.error('Verification error:', err);
  } finally {
    app.quit();
  }
});
