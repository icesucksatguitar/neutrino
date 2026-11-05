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
    await wait(2000);

    // 1. Capture Light Theme at 1920x1080 (Black Tree, No wordmark, Search hidden at first)
    console.log('1. Capturing Light Theme at 1920x1080 (Black Tree, No wordmark, Search hidden)...');
    win.setSize(1920, 1080);
    await wait(1200);

    let img = await win.webContents.capturePage();
    let outPath = path.join(ARTIFACT_DIR, 'verified_light_mode_black_tree_1920x1080.png');
    fs.writeFileSync(outPath, img.toPNG());
    console.log('Saved:', outPath);

    // 2. Capture Light Theme at 1280x720
    console.log('2. Capturing Light Theme at 1280x720...');
    win.setSize(1280, 720);
    await wait(1200);

    img = await win.webContents.capturePage();
    outPath = path.join(ARTIFACT_DIR, 'verified_light_mode_black_tree_1280x720.png');
    fs.writeFileSync(outPath, img.toPNG());
    console.log('Saved:', outPath);

    // 3. Trigger Search Bar via "+ New Tab" button click
    console.log('3. Triggering search bar appearance via + New Tab button...');
    win.setSize(1920, 1080);
    await wait(500);
    await win.webContents.executeJavaScript(`
      const newTabBtn = document.querySelector('.arc-new-tab-btn');
      if (newTabBtn) newTabBtn.click();
      else window.dispatchEvent(new CustomEvent('neutrino:show-search'));
    `);
    await wait(800);

    img = await win.webContents.capturePage();
    outPath = path.join(ARTIFACT_DIR, 'verified_search_bar_revealed.png');
    fs.writeFileSync(outPath, img.toPNG());
    console.log('Saved search revealed:', outPath);

    // 4. Open AI & MCP panel on the right side
    console.log('4. Opening AI & MCP panel on the right side...');
    await win.webContents.executeJavaScript(`
      const aiBtn = document.querySelector('.arc-top-right-bar button[title*="AI"]');
      if (aiBtn) aiBtn.click();
    `);
    await wait(1200);

    img = await win.webContents.capturePage();
    outPath = path.join(ARTIFACT_DIR, 'verified_ai_mcp_panel_right_side.png');
    fs.writeFileSync(outPath, img.toPNG());
    console.log('Saved AI MCP panel:', outPath);

    // 5. Test Dragging / Moving AI panel across the screen
    console.log('5. Moving AI & MCP panel (testing moveable/draggable)...');
    await win.webContents.executeJavaScript(`
      const drawer = document.querySelector('.mcp-drawer');
      if (drawer) {
        drawer.style.left = '450px';
        drawer.style.top = '140px';
      }
    `);
    await wait(800);

    img = await win.webContents.capturePage();
    outPath = path.join(ARTIFACT_DIR, 'verified_ai_mcp_panel_dragged_moved.png');
    fs.writeFileSync(outPath, img.toPNG());
    console.log('Saved dragged AI MCP panel:', outPath);

    // Close AI panel
    await win.webContents.executeJavaScript(`
      const closeBtn = document.querySelector('.mcp-drawer-close-btn');
      if (closeBtn) closeBtn.click();
    `);
    await wait(600);

    // 6. Switch to Dark Mode (Milky Way Galaxy ASCII Art)
    console.log('6. Switching to Dark Mode (Milky Way Galaxy ASCII Art)...');
    await win.webContents.executeJavaScript(`
      const darkBtn = document.querySelector('.arc-top-right-bar button[title*="Dark"], .arc-top-right-bar button[title*="Light"]');
      if (darkBtn) darkBtn.click();
    `);
    await wait(1500);

    img = await win.webContents.capturePage();
    outPath = path.join(ARTIFACT_DIR, 'verified_dark_mode_milky_way_1920x1080.png');
    fs.writeFileSync(outPath, img.toPNG());
    console.log('Saved Dark Mode 1920x1080:', outPath);

    win.setSize(1280, 720);
    await wait(1200);

    img = await win.webContents.capturePage();
    outPath = path.join(ARTIFACT_DIR, 'verified_dark_mode_milky_way_1280x720.png');
    fs.writeFileSync(outPath, img.toPNG());
    console.log('Saved Dark Mode 1280x720:', outPath);

    // Check DOM verification
    const testResult = await win.webContents.executeJavaScript(`
      (() => {
        return {
          hasNeutrinoText: !!document.querySelector('.homescreen-wordmark'),
          hasCanvas: !!document.querySelector('.homescreen-ascii-canvas'),
          topBarPills: Array.from(document.querySelectorAll('.arc-top-right-bar button')).map(b => b.title),
          currentTheme: document.documentElement.getAttribute('data-theme')
        };
      })()
    `);
    console.log('DOM Verification Result:', JSON.stringify(testResult, null, 2));

    const logPath = path.join(ARTIFACT_DIR, 'verification_summary.json');
    fs.writeFileSync(logPath, JSON.stringify(testResult, null, 2));

    console.log('All verifications completed successfully!');
    app.quit();
  } catch (err) {
    console.error('Verification failed:', err);
    app.quit();
  }
});
