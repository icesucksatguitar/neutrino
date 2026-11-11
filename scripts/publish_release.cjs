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

- **Arc-Style Per-Space Theme Editor**:
  - Customizable 2- and 3-point radial gradients, intensity, grain overlay, and per-Space Light / Dark / Auto mode.
  - Smooth Space transitions, presets, accessible keyboard/pointer color wheel, and debounced live persistence.

- **Persistent User Settings & Caching**:
  - Atomic settings persistence across restarts for Spaces, themes, modes, font scale, and browser preferences.

- **Built-In Browsing History Viewer**:
  - Searchable local history drawer with timestamps, filtering, and quick navigation.

- **Built-In VPN & DNS-over-HTTPS (DoH)**:
  - Integrated local proxy / DoH privacy routing with server presets, connection verification, and kill-switch support.

- **Faster Forced Dark Mode & Idle RAM Optimization**:
  - Reduced initial dark-mode injection latency and optimized idle memory footprint via lazy-loaded modals/splash and lean Electron startup configuration.

- **Google Sign-In & OAuth Reliability**:
  - Consistent browser identity and user-agent derivation, single-pass tab navigation to prevent OAuth callback replays, and external browser handoff when needed.

### Download for Windows (x64)
Download and extract \`${assetName}\` and run \`Neutrino.exe\`.`,
    draft: false,
    prerelease: false,
  };

  console.log(`Creating GitHub release ${tagName}...`);
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

  console.log(`Create release response status: ${createRes.status}`);
  if (createRes.status !== 201) {
    console.error('Failed to create release:', createRes.body);
    process.exit(1);
  }

  const release = createRes.body;
  console.log(`Release created successfully: ${release.html_url}`);

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

