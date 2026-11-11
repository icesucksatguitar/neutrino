const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getGitHubToken() {
  try {
    const credInput = Buffer.from('protocol=https\nhost=github.com\n\n');
    const output = execSync('git credential fill', { input: credInput, encoding: 'utf-8' });
    const match = output.match(/password=(.+)/);
    if (match && match[1]) {
      return match[1].trim();
    }
  } catch (err) {
    console.error('Failed to get credential from git credential fill:', err);
  }
  return process.env.GITHUB_TOKEN || '';
}

function httpsRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      if (Buffer.isBuffer(body)) {
        req.write(body);
      } else if (typeof body === 'object') {
        req.write(JSON.stringify(body));
      } else {
        req.write(body);
      }
    }
    req.end();
  });
}

async function uploadAsset(uploadUrlTemplate, filePath, token) {
  const uploadUrlRaw = uploadUrlTemplate.replace(/\{\?name,label\}/, '');
  const fileName = path.basename(filePath);
  const fileStats = fs.statSync(filePath);
  const fileSize = fileStats.size;

  const urlObj = new URL(`${uploadUrlRaw}?name=${encodeURIComponent(fileName)}`);

  console.log(`Uploading ${fileName} (${(fileSize / (1024 * 1024)).toFixed(2)} MB) to ${urlObj.hostname}...`);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'Neutrino-Release-Agent',
          'Content-Type': 'application/zip',
          'Content-Length': fileSize,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          console.log(`Upload status: ${res.statusCode}`);
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );

    req.on('error', reject);

    const fileStream = fs.createReadStream(filePath);
    let uploadedBytes = 0;
    fileStream.on('data', (chunk) => {
      uploadedBytes += chunk.length;
      process.stdout.write(
        `\rProgress: ${((uploadedBytes / fileSize) * 100).toFixed(1)}% (${(uploadedBytes / 1048576).toFixed(1)} MB / ${(fileSize / 1048576).toFixed(1)} MB)`
      );
    });

    fileStream.on('end', () => {
      console.log('\nFinished streaming file bytes, awaiting GitHub confirmation...');
    });

    fileStream.pipe(req);
  });
}

async function main() {
  const token = getGitHubToken();
  if (!token) {
    console.error('No GitHub token found!');
    process.exit(1);
  }

  console.log('GitHub token found! Checking user...');
  const userRes = await httpsRequest({
    hostname: 'api.github.com',
    path: '/user',
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Neutrino-Release-Agent',
    },
  });

  if (userRes.status !== 200) {
    console.error('Failed to authenticate with GitHub:', userRes);
    process.exit(1);
  }
  console.log(`Authenticated as GitHub user: ${userRes.body.login}`);

  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const tagName = `v${pkg.version}`;
  const assetName = `Neutrino-${tagName}-win32-x64.zip`;

  const releasePayload = {
    tag_name: tagName,
    target_commitish: 'main',
    name: `Neutrino ${tagName} - Release 2.1`,
    body: `## Neutrino Browser ${tagName} (Release 2.1)

A local-first, high-speed Chromium desktop browser engineered with low memory usage, privacy controls, and per-Space customizability.

### What's New in ${tagName}

- **Site Navigation Controls, Trackpad Gestures & Keyboard Shortcuts**:
  - Top-bar **Back**, **Forward**, **Reload / Stop**, and **Home** controls alongside an enhanced URL pill with HTTPS indicator, loading progress shimmer, Copy URL button, Find trigger, and Zoom badge.
  - Built-in **Find in Page** (\`Ctrl+F\`), right-click site context menu (**Back**, **Forward**, **Reload**, **Open Link in New Tab**, **Copy Link Address**, **Inspect Element**), and single-dispatch keyboard shortcuts (\`Ctrl+W\` / \`Ctrl+F4\`, \`Ctrl+Shift+T\` reopen closed tab, \`Ctrl+Tab\` / \`Ctrl+Shift+Tab\`, \`Alt+Left\` / \`Alt+Right\`, \`F5\`, \`F6\`).
  - Two-finger horizontal trackpad swipe Back/Forward navigation with edge indicator chevrons, plus mouse XButton3/4 and OS navigation key support.

- **Customizable Animated Homescreen Ambient Glow**:
  - Restored silky blurred ambient aura animation with four per-Space styles (**Match Theme**, **Prism** rainbow cycle, **Custom** color picker/hex, **Off**) plus live **Glow Strength**, **Motion Speed**, and **Aura Spread** sliders inside the **Space Theme** editor.

- **Arc-Style Per-Space Theme Editor**:
  - Customizable 2- and 3-point radial gradients, intensity, grain overlay, and per-Space Light / Dark / Auto browser chrome mode with smooth Space transitions and presets.

- **Native Website Rendering & Idle RAM Optimization**:
  - Removed forced dark-mode website injection so pages render natively without visual artifacts or CSS slowdown, alongside lazy-loaded modals and lean Electron startup memory usage.

- **Persistent User Settings, History & Built-In VPN**:
  - Atomic settings persistence across restarts, searchable local Browsing History drawer, and integrated DoH / proxy VPN toggle with kill-switch support.

- **Google Sign-In & OAuth Reliability**:
  - Consistent browser identity and user-agent derivation, single-pass tab navigation to prevent OAuth callback replays, and external browser handoff when needed.

### Download for Windows (x64)
Download and extract \`${assetName}\` and run \`Neutrino.exe\`.`,
    draft: false,
    prerelease: false,
  };

  console.log(`Creating or updating GitHub release ${tagName}...`);
  const createRes = await httpsRequest(
    {
      hostname: 'api.github.com',
      path: '/repos/icesucksatguitar/neutrino/releases',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'Neutrino-Release-Agent',
        'Content-Type': 'application/json',
      },
    },
    releasePayload
  );

  let release;
  if (createRes.status === 201) {
    release = createRes.body;
    console.log(`Release created successfully: ${release.html_url}`);
  } else if (createRes.status === 422) {
    const existingRes = await httpsRequest({
      hostname: 'api.github.com',
      path: `/repos/icesucksatguitar/neutrino/releases/tags/${encodeURIComponent(tagName)}`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'Neutrino-Release-Agent',
      },
    });
    if (existingRes.status !== 200 || !existingRes.body?.id) {
      console.error('Failed to look up existing release:', existingRes);
      process.exit(1);
    }
    const patchRes = await httpsRequest(
      {
        hostname: 'api.github.com',
        path: `/repos/icesucksatguitar/neutrino/releases/${existingRes.body.id}`,
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'Neutrino-Release-Agent',
          'Content-Type': 'application/json',
        },
      },
      releasePayload
    );
    if (patchRes.status !== 200) {
      console.error('Failed to update existing release:', patchRes);
      process.exit(1);
    }
    release = patchRes.body;
    console.log(`Existing release updated: ${release.html_url}`);

    const staleAssets = (existingRes.body.assets || []).filter((a) => a.name === assetName);
    for (const stale of staleAssets) {
      console.log(`Deleting previous asset ${stale.name} (id ${stale.id})...`);
      const delRes = await httpsRequest({
        hostname: 'api.github.com',
        path: `/repos/icesucksatguitar/neutrino/releases/assets/${stale.id}`,
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'Neutrino-Release-Agent',
        },
      });
      if (delRes.status !== 204 && delRes.status !== 200) {
        console.error('Failed to delete stale asset:', delRes);
        process.exit(1);
      }
    }
  } else {
    console.error('Failed to create release:', createRes.body);
    process.exit(1);
  }

  const zipPath = path.join(__dirname, '..', 'release', assetName);
  if (fs.existsSync(zipPath)) {
    const uploadRes = await uploadAsset(release.upload_url, zipPath, token);
    console.log('Upload result:', uploadRes.status);
    console.log(`Asset URL: ${uploadRes.body.browser_download_url || uploadRes.body.url}`);
  } else {
    console.error(`Zip file not found at: ${zipPath}`);
    process.exit(1);
  }

  console.log(`--- Release ${tagName} Published Successfully! ---`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

