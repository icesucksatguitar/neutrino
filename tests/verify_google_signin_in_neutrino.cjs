const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\simpl\\.gemini\\antigravity\\brain\\5ab3cecc-0f9a-4067-a03a-0ad1710d3f7c';

// Require the compiled main entry setup logic
const {
  CHROME_USER_AGENT,
  GOOGLE_AUTH_USER_AGENT,
  isGoogleAuthUrl,
} = require('../dist-main/index.js');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

app.userAgentFallback = CHROME_USER_AGENT;

app.whenReady().then(async () => {
  try {
    const sess = session.fromPartition('persist:neutrino');
    sess.setUserAgent(CHROME_USER_AGENT);

    sess.webRequest.onBeforeSendHeaders((details, callback) => {
      const headers = { ...details.requestHeaders };

      if (isGoogleAuthUrl(details.url)) {
        headers['User-Agent'] = GOOGLE_AUTH_USER_AGENT;
        delete headers['Sec-CH-UA'];
        delete headers['sec-ch-ua'];
        delete headers['Sec-CH-UA-Mobile'];
        delete headers['sec-ch-ua-mobile'];
        delete headers['Sec-CH-UA-Platform'];
        delete headers['sec-ch-ua-platform'];
        delete headers['Sec-CH-UA-Platform-Version'];
        delete headers['sec-ch-ua-platform-version'];
      } else {
        headers['User-Agent'] = CHROME_USER_AGENT;
        if (headers['Sec-CH-UA']) {
          headers['Sec-CH-UA'] = '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"';
        }
        if (headers['sec-ch-ua']) {
          headers['sec-ch-ua'] = '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"';
        }
      }

      callback({ requestHeaders: headers });
    });

    const win = new BrowserWindow({
      width: 1000,
      height: 800,
      show: true,
      webPreferences: {
        partition: 'persist:neutrino',
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    console.log('--- Navigating to Google Sign-In ---');
    await win.loadURL('https://accounts.google.com/ServiceLogin').catch((err) => {
      if (err.code !== 'ERR_ABORTED' && err.errno !== -3) throw err;
    });
    await new Promise((r) => setTimeout(r, 4000));

    console.log('--- Submitting test email ---');
    await win.webContents.executeJavaScript(`
      (() => {
        const input = document.querySelector('input[type="email"]') || document.querySelector('#identifierId');
        if (input) {
          input.value = 'yash.test.account.2026@gmail.com';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      })()
    `);

    await new Promise((r) => setTimeout(r, 1000));

    await win.webContents.executeJavaScript(`
      (() => {
        const nextBtn = document.querySelector('#identifierNext button') || document.querySelector('#identifierNext') || document.querySelector('button');
        if (nextBtn) {
          nextBtn.click();
          return true;
        }
        return false;
      })()
    `);

    await new Promise((r) => setTimeout(r, 5500));

    const finalUrl = win.webContents.getURL();
    const bodyText = await win.webContents.executeJavaScript(`document.body.innerText`);
    const isBlocked = bodyText.includes("Couldn't sign you in") || bodyText.includes("may not be secure");

    console.log('Final URL:', finalUrl);
    console.log('Is Google Sign-in Blocked?:', isBlocked);

    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_v5_google_login_success.png'), img.toPNG());

    if (!isBlocked) {
      console.log('SUCCESS: Google Account login proceeded without security block!');
    } else {
      console.error('FAIL: Still blocked');
    }

    app.quit();
  } catch (err) {
    console.error('Test error:', err);
    app.quit();
  }
});
