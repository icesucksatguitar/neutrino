const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'test_preload.cjs'),
      webviewTag: true,
    },
  });

  await win.loadFile(path.join(__dirname, '..', 'dist-renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 1500));

  await win.webContents.executeJavaScript('document.querySelector(".pin-dock-item")?.click()');
  await new Promise((r) => setTimeout(r, 1000));

  const vars = await win.webContents.executeJavaScript(`
    (() => {
      const capsule = document.querySelector('.floating-top-chrome-capsule');
      return {
        capsuleClass: capsule?.className,
        urlText: document.querySelector('.url-domain-text')?.textContent,
        commandBar: Boolean(document.querySelector('.command-bar-overlay')),
        notificationTabs: Boolean(document.querySelector('.notification-tabs-overlay')),
        topZone: Boolean(document.querySelector('.top-edge-hover-zone')),
      };
    })()
  `);
  console.log('DOM checks:', vars);

  app.quit();
});