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

  console.log('Fetching release v0.2.0...');
  const relRes = await httpsRequest({
    hostname: 'api.github.com',
    path: '/repos/icesucksatguitar/neutrino/releases/tags/v0.2.0',
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Neutrino-Release-Agent',
    },
  });

  if (relRes.status !== 200) {
    console.error('Failed to get release:', relRes.body);
    process.exit(1);
  }

  const release = relRes.body;
  const existingAsset = release.assets.find((a) => a.name === 'Neutrino-v0.2.0-win32-x64.zip');
  if (existingAsset) {
    console.log(`Deleting old asset ${existingAsset.id}...`);
    await httpsRequest({
      hostname: 'api.github.com',
      path: `/repos/icesucksatguitar/neutrino/releases/assets/${existingAsset.id}`,
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'Neutrino-Release-Agent',
      },
    });
    console.log('Old asset deleted.');
  }

  const zipPath = path.join(__dirname, '..', 'release', 'Neutrino-v0.2.0-win32-x64.zip');
  await uploadAsset(release.upload_url, zipPath, token);
  console.log('--- Release v0.2.0 Asset Updated with Optimized Build! ---');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
