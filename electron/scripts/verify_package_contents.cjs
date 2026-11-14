#!/usr/bin/env node
// Leftover-file check for packaged builds (bugfix spec google-signin-youtube-playback-fix, 1.17 / 2.17).
//
// Walks every release/Neutrino-*/resources/app directory and exits non-zero when:
//   - a path matches the developer-only ignore list from design.md, or
//   - a text file contains a developer machine path (C:/Users/... or C:\Users\...).
//
// Usage: node scripts/verify_package_contents.cjs [releaseDir]
//        Writes a JSON summary to stdout. Exit 0 = clean, 1 = leftovers found, 2 = nothing to check.

const fs = require('fs');
const path = require('path');

// Anchored against the path relative to resources/app, with a leading "/" and forward slashes.
const IGNORE_LIST = [
  /^\/(tests|scratch|docs|native|app|scripts|src|release|\.github|\.kiro)(\/|$)/,
  /^\/[^/]+\.(md|py|png|ps1)$/,
  /^\/(tsconfig[^/]*\.json|vite\.config\.ts|Cargo\.(toml|lock))$/,
];

// Literal "C:/Users/" or "C:\Users\" (also the doubled-backslash form used in JS/JSON string literals).
const USER_PATH = /C:(\/|\\\\|\\)Users(\/|\\\\|\\)/i;

const TEXT_EXT = new Set(['.js', '.cjs', '.mjs', '.ts', '.tsx', '.json', '.md', '.py', '.ps1', '.html', '.css', '.txt', '.map', '.yml', '.yaml', '']);
const MAX_SCAN_BYTES = 8 * 1024 * 1024;

function walk(dir, root, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = '/' + path.relative(root, abs).split(path.sep).join('/');
    if (entry.isDirectory()) {
      out.dirs.push(rel);
      walk(abs, root, out);
    } else {
      out.files.push({ rel, abs });
    }
  }
}

function main() {
  const releaseDir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'release'));
  if (!fs.existsSync(releaseDir)) {
    console.error(`No release directory at ${releaseDir}. Package the app first.`);
    process.exit(2);
  }

  const appDirs = fs
    .readdirSync(releaseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith('Neutrino-'))
    .map((d) => path.join(releaseDir, d.name, 'resources', 'app'))
    .filter((p) => fs.existsSync(p));

  if (appDirs.length === 0) {
    console.error(`No release/Neutrino-*/resources/app directory under ${releaseDir}.`);
    process.exit(2);
  }

  const report = [];
  let failed = false;

  for (const appDir of appDirs) {
    const listing = { dirs: [], files: [] };
    walk(appDir, appDir, listing);

    const ignoreMatches = new Set();
    for (const p of [...listing.dirs, ...listing.files.map((f) => f.rel)]) {
      if (IGNORE_LIST.some((re) => re.test(p))) {
        // Report the top-level entry only, not every file below a matched directory.
        const top = '/' + p.split('/')[1];
        ignoreMatches.add(IGNORE_LIST[0].test(top) ? top + '/' : p);
      }
    }

    const userPathHits = [];
    for (const f of listing.files) {
      if (!TEXT_EXT.has(path.extname(f.rel).toLowerCase())) continue;
      const stat = fs.statSync(f.abs);
      if (stat.size > MAX_SCAN_BYTES) continue;
      const text = fs.readFileSync(f.abs, 'utf8');
      const m = text.match(USER_PATH);
      if (m) {
        const idx = m.index || 0;
        userPathHits.push({ file: f.rel, sample: text.slice(idx, idx + 60).replace(/\s+/g, ' ') });
      }
    }

    const entry = {
      appDir,
      fileCount: listing.files.length,
      ignoreListMatches: Array.from(ignoreMatches).sort(),
      userPathHits,
    };
    if (entry.ignoreListMatches.length > 0 || userPathHits.length > 0) failed = true;
    report.push(entry);
  }

  console.log(JSON.stringify({ ok: !failed, report }, null, 2));
  process.exit(failed ? 1 : 0);
}

main();
