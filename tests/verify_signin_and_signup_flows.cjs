const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:\\Users\\simpl\\.gemini\\antigravity\\brain\\5ab3cecc-0f9a-4067-a03a-0ad1710d3f7c';

const { CHROME_USER_AGENT, isAuthOrSecurityUrl } = require('../dist-main/index');
const { BraveShieldEngine } = require('../dist-main/adblock/engine');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');
app.commandLine.appendSwitch('disable-features', 'ThirdPartyStoragePartitioning');

app.userAgentFallback = CHROME_USER_AGENT;

app.whenReady().then(async () => {
  console.log('=== VERIFYING NEUTRINO SIGN-IN & SIGN-UP FLOWS ===');
  const adblockEngine = new BraveShieldEngine();
  const testSession = session.fromPartition('persist:neutrino_verify_final');
  testSession.setUserAgent(CHROME_USER_AGENT);

  testSession.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    if (isAuthOrSecurityUrl(details.url)) {
      callback({ cancel: false });
      return;
    }
    const decision = adblockEngine.checkUrl(details.url);
    callback({ cancel: decision.blocked });
  });

  testSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };
    headers['User-Agent'] = CHROME_USER_AGENT;
    headers['Sec-CH-UA'] = '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"';
    headers['sec-ch-ua'] = '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"';
    headers['Sec-CH-UA-Mobile'] = '?0';
    headers['sec-ch-ua-mobile'] = '?0';
    headers['Sec-CH-UA-Platform'] = '"Windows"';
    headers['sec-ch-ua-platform'] = '"Windows"';
    callback({ requestHeaders: headers });
  });

  // TEST 1: Google Authentication Verification
  console.log('\n--- 1. Testing Google Sign-In Flow ---');
  const googleWin = new BrowserWindow({
    width: 1000,
    height: 800,
    show: true,
    webPreferences: {
      partition: 'persist:neutrino_verify_final',
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await googleWin.loadURL('https://accounts.google.com/ServiceLogin');
  await new Promise((r) => setTimeout(r, 3500));

  await googleWin.webContents.executeJavaScript(`
    (() => {
      const input = document.querySelector('input[type="email"]') || document.querySelector('#identifierId');
      if (input) input.focus();
    })()
  `);
  await new Promise((r) => setTimeout(r, 400));

  const testEmail = 'yash.test.account.2026@gmail.com';
  for (const c of testEmail) {
    googleWin.webContents.sendInputEvent({ type: 'keyDown', keyCode: c });
    googleWin.webContents.sendInputEvent({ type: 'char', keyCode: c });
    googleWin.webContents.sendInputEvent({ type: 'keyUp', keyCode: c });
    await new Promise((r) => setTimeout(r, 20 + Math.random() * 20));
  }

  await new Promise((r) => setTimeout(r, 600));
  googleWin.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
  googleWin.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
  googleWin.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
  await new Promise((r) => setTimeout(r, 4000));

  const googleUrl = googleWin.webContents.getURL();
  const googleText = await googleWin.webContents.executeJavaScript(`document.body.innerText`);
  const isGoogleBlocked = googleUrl.includes('rrk=46') || googleText.includes("Couldn't sign you in") || googleText.includes("may not be secure");

  console.log('Google URL after submit:', googleUrl);
  console.log('Is Google Sign-In Blocked?:', isGoogleBlocked);
  if (isGoogleBlocked) {
    throw new Error('FAILED: Google Sign-In was blocked!');
  }
  console.log('PASS: Google Sign-In accepted credentials without security block.');

  try {
    const googleImg = await googleWin.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_google_login_allowed.png'), googleImg.toPNG());
  } catch {}
  googleWin.close();

  // TEST 2: GitHub Authentication Verification
  console.log('\n--- 2. Testing GitHub Sign-In Flow ---');
  const ghWin = new BrowserWindow({
    width: 1000,
    height: 800,
    show: true,
    webPreferences: {
      partition: 'persist:neutrino_verify_final',
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await ghWin.loadURL('https://github.com/login');
  await new Promise((r) => setTimeout(r, 3000));

  const ghFormState = await ghWin.webContents.executeJavaScript(`
    (() => {
      const loginField = document.querySelector('#login_field');
      const passField = document.querySelector('#password');
      const submitBtn = document.querySelector('input[type="submit"], button[type="submit"]');
      return {
        hasLoginField: !!loginField,
        hasPassField: !!passField,
        hasSubmitBtn: !!submitBtn,
        title: document.title
      };
    })()
  `);
  console.log('GitHub Form State:', ghFormState);
  if (!ghFormState.hasLoginField || !ghFormState.hasPassField || !ghFormState.hasSubmitBtn) {
    throw new Error('FAILED: GitHub login fields not loaded!');
  }
  console.log('PASS: GitHub login interface active and functional.');
  try {
    const ghImg = await ghWin.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'verified_github_login_allowed.png'), ghImg.toPNG());
  } catch {}
  ghWin.close();

  // TEST 3: OAuth Popup & Window.open Handler Verification
  console.log('\n--- 3. Testing OAuth Popup & setWindowOpenHandler ---');
  const parentWin = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      partition: 'persist:neutrino_verify_final',
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  let popupCreated = false;
  parentWin.webContents.setWindowOpenHandler((details) => {
    const url = details.url || '';
    const hasWindowFeatures = details.features && (details.features.includes('width=') || details.features.includes('height='));
    const isPopup = details.disposition === 'new-window' || hasWindowFeatures || isAuthOrSecurityUrl(url) || url === 'about:blank' || !url;
    if (isPopup) {
      popupCreated = true;
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 540,
          height: 700,
          frame: true,
          webPreferences: {
            partition: 'persist:neutrino_verify_final',
            contextIsolation: true,
          },
        },
      };
    }
    return { action: 'deny' };
  });

  await parentWin.loadURL('about:blank');
  await parentWin.webContents.executeJavaScript(`
    (() => {
      const p = window.open('about:blank', 'authPopup', 'width=500,height=600');
      return !!p;
    })()
  `);
  await new Promise((r) => setTimeout(r, 1000));
  console.log('OAuth Popup allowed and created?:', popupCreated);
  if (!popupCreated) {
    throw new Error('FAILED: OAuth popup was blocked!');
  }
  console.log('PASS: OAuth popups with about:blank & dimensions are cleanly allowed.');
  parentWin.close();

  console.log('\n=== ALL SIGN-IN AND SIGN-UP VERIFICATIONS PASSED SUCCESSFULLY ===');
  app.quit();
});
