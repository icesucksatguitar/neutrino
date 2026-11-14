const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\simpl\\.gemini\\antigravity\\brain\\5ab3cecc-0f9a-4067-a03a-0ad1710d3f7c';

// Modern Firefox Desktop User Agent
const FIREFOX_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0';

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');

app.userAgentFallback = FIREFOX_UA;

app.whenReady().then(async () => {
  try {
    const sess = session.fromPartition('persist:neutrino');
    sess.setUserAgent(FIREFOX_UA);

    // Strip Chrome/Electron specific headers when pretending to be Firefox
    sess.webRequest.onBeforeSendHeaders((details, callback) => {
      const headers = { ...details.requestHeaders };
      headers['User-Agent'] = FIREFOX_UA;
      delete headers['Sec-CH-UA'];
      delete headers['sec-ch-ua'];
      delete headers['Sec-CH-UA-Mobile'];
      delete headers['sec-ch-ua-mobile'];
      delete headers['Sec-CH-UA-Platform'];
      delete headers['sec-ch-ua-platform'];
      delete headers['Sec-CH-UA-Platform-Version'];
      callback({ requestHeaders: headers });
    });

    const win = new BrowserWindow({
      width: 1000,
      height: 800,
      show: true,
      webPreferences: {
        partition: 'persist:neutrino',
        contextIsolation: true,
      },
    });

    win.webContents.setUserAgent(FIREFOX_UA);

    console.log('Loading accounts.google.com/ServiceLogin with Firefox UA...');
    await win.loadURL('https://accounts.google.com/ServiceLogin');
    await new Promise((r) => setTimeout(r, 3500));

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

    await new Promise((r) => setTimeout(r, 5000));

    const pageUrl = win.webContents.getURL();
    const pageText = await win.webContents.executeJavaScript(`document.body.innerText`);
    console.log('Page URL after submit:', pageUrl);

    const isSecureBlocked = pageText.includes("Couldn't sign you in") || pageText.includes("may not be secure");
    console.log('Is Blocked with Firefox UA?:', isSecureBlocked);
    console.log('Snippet of page text:', pageText.substring(0, 300).replace(/\\n/g, ' '));

    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'test_google_firefox_ua_result.png'), img.toPNG());

    app.quit();
  } catch (err) {
    console.error('Test error:', err);
    app.quit();
  }
});

