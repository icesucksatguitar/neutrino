const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\simpl\\.gemini\\antigravity\\brain\\5ab3cecc-0f9a-4067-a03a-0ad1710d3f7c';

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');

app.whenReady().then(async () => {
  try {
    const sess = session.fromPartition('persist:neutrino');
    const currentSession = session.defaultSession;

    const win = new BrowserWindow({
      width: 1000,
      height: 800,
      show: true,
      webPreferences: {
        partition: 'persist:neutrino',
        contextIsolation: true,
      },
    });

    console.log('Default user agent:', win.webContents.getUserAgent());
    console.log('App user agent fallback:', app.userAgentFallback);

    await win.loadURL('https://accounts.google.com/ServiceLogin');
    await new Promise((resolve) => setTimeout(resolve, 4000));

    const pageTitle = win.getTitle();
    const url = win.webContents.getURL();
    console.log('Page Title:', pageTitle);
    console.log('Loaded URL:', url);

    const bodyText = await win.webContents.executeJavaScript(`document.body.innerText`);
    const isBlocked = bodyText.includes("Couldn't sign you in") || bodyText.includes("may not be secure");
    console.log('Is Google Sign-in Blocked?:', isBlocked);

    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'test_google_login_result.png'), img.toPNG());

    app.quit();
  } catch (err) {
    console.error('Test error:', err);
    app.quit();
  }
});

