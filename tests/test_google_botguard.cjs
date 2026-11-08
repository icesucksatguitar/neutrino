const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\simpl\\.gemini\\antigravity\\brain\\5ab3cecc-0f9a-4067-a03a-0ad1710d3f7c';

const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

// 1. Set global fallback user agent
app.userAgentFallback = DESKTOP_USER_AGENT;

app.whenReady().then(async () => {
  try {
    const sess = session.fromPartition('persist:neutrino');
    sess.setUserAgent(DESKTOP_USER_AGENT);

    // 2. Sanitize Client Hints and Headers
    sess.webRequest.onBeforeSendHeaders((details, callback) => {
      const headers = { ...details.requestHeaders };
      headers['User-Agent'] = DESKTOP_USER_AGENT;
      headers['Sec-CH-UA'] = '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"';
      headers['sec-ch-ua'] = '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"';
      headers['Sec-CH-UA-Mobile'] = '?0';
      headers['sec-ch-ua-mobile'] = '?0';
      headers['Sec-CH-UA-Platform'] = '"Windows"';
      headers['sec-ch-ua-platform'] = '"Windows"';
      headers['Sec-CH-UA-Platform-Version'] = '"15.0.0"';
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

    win.webContents.setUserAgent(DESKTOP_USER_AGENT);

    console.log('Loading accounts.google.com/ServiceLogin...');
    await win.loadURL('https://accounts.google.com/ServiceLogin');
    await new Promise((r) => setTimeout(r, 3500));

    // Type email into Google's identifier input
    console.log('Entering test email...');
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

    // Click Next button
    console.log('Clicking Next...');
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

    // Wait for Google's botguard / password page to load
    await new Promise((r) => setTimeout(r, 5000));

    const pageUrl = win.webContents.getURL();
    const pageText = await win.webContents.executeJavaScript(`document.body.innerText`);
    console.log('Page URL after submit:', pageUrl);

    const isSecureBlocked = pageText.includes("Couldn't sign you in") || pageText.includes("may not be secure");
    console.log('Is Blocked with "This browser or app may not be secure"?:', isSecureBlocked);
    console.log('Snippet of page text:', pageText.substring(0, 300).replace(/\\n/g, ' '));

    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'test_google_botguard_result.png'), img.toPNG());

    app.quit();
  } catch (err) {
    console.error('Test error:', err);
    app.quit();
  }
});

