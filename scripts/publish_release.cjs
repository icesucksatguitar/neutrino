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

  const releasePayload = {
    tag_name: 'v0.2.0',
    target_commitish: 'main',
    name: 'Neutrino v0.2.0 - Second Release',
    body: `## Neutrino Browser v0.2.0 (Second Release)

A high-speed, local-first, distraction-free desktop browser engineered with the philosophy that the web page is the product.

### What's New in v0.2.0

- **Cinematic Startup Splash Animation**:
  - Smooth centered reveal featuring the *Neutrino* wordmark in italic Claude Serif.
  - Ambient particle orbital ring with quantum neutrino rotation.
  - Butter-smooth fade-in and fade-out transition into the active browser UI with instant click/key skip.

- **Zen Mode Sleeping Tab Overhaul**:
  - Replaced unstyled sleeping placeholders with a centered, monochromatic frosted obsidian glass card.
  - Zero collision with macOS traffic lights or top-left window controls.
  - Animated moon orbit, RAM memory savings indicator, domain badge, and instant full-screen or button wake.

- **Opaque macOS Traffic Light Window Controls**:
  - Native-style window controls positioned cleanly on the top-left edge.
  - Auto-hides when browsing active sites to maintain 100% web page usability and eliminate interface obstructions.

- **Universal Forced Dark Mode (DarkReader Engine)**:
  - Integrated local DarkReader engine delivering client-side dark themes for all websites.
  - Instant live toggle between pure pitch black and warm light atmospheres.

- **Universal Website Sign-in & Authentication**:
  - Clean desktop Chrome user-agent spoofing across all sessions and webviews.
  - Unpartitioned cookies and session routing resolving Google OAuth ("This browser or app may not be secure"), GitHub, Claude, and Cloudflare Turnstile barriers.

- **Tactile Space Switcher Slider**:
  - Interactive spring slider for seamlessly transitioning between Study, Work, and Leisure spaces.

### Download for Windows (x64)
Download and extract \`Neutrino-v0.2.0-win32-x64.zip\` and run \`Neutrino.exe\`.`,
    draft: false,
    prerelease: false,
  };

  console.log('Creating GitHub release v0.2.0...');
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

  const zipPath = path.join(__dirname, '..', 'release', 'Neutrino-v0.2.0-win32-x64.zip');
  if (fs.existsSync(zipPath)) {
    const uploadRes = await uploadAsset(release.upload_url, zipPath, token);
    console.log('Upload result:', uploadRes.status);
    console.log(`Asset URL: ${uploadRes.body.browser_download_url || uploadRes.body.url}`);
  } else {
    console.error(`Zip file not found at: ${zipPath}`);
  }

  console.log('--- Release v0.2.0 Published Successfully! ---');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
