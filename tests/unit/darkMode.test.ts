/**
 * Tests for the main-process DarkReader rules in src/main/darkMode.ts (browser-settings-panel spec).
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shouldInjectDarkReader } from '../../src/main/darkMode';
import { originalIsDarkReaderEligible } from './fixtures/original/darkReaderEligibility';

const NUM_RUNS = 300;

// ---------------------------------------------------------------------------
// Independent Host_Match oracle, written from the requirements glossary: the page host matches an
// entry when it equals the entry or ends with "." + entry, in lowercase with a leading "www." removed.
// Only http(s) pages have a host that can match.
// ---------------------------------------------------------------------------

function stripWww(host: string): string {
  return host.startsWith('www.') ? host.slice(4) : host;
}

function oracleHostMatch(url: string, entries: readonly string[]): boolean {
  let host: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    host = stripWww(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
  if (!host) return false;
  return entries.some((raw) => {
    const entry = stripWww(raw.toLowerCase());
    return host === entry || host.endsWith(`.${entry}`);
  });
}

// ---------------------------------------------------------------------------
// Generators. Labels never equal "www" so the oracle's plain "www." strip agrees with the
// canonical form used by settings.ts (which keeps "www.com" as is).
// ---------------------------------------------------------------------------

const labelArb = fc.oneof(
  fc.constantFrom('youtube', 'notyoutube', 'google', 'accounts', 'example', 'news', 'm', 'video', 'my-site', 'a1'),
  fc.stringMatching(/^[a-z][a-z0-9]{0,6}$/).filter((l) => l !== 'www'),
);
const tldArb = fc.constantFrom('com', 'org', 'io', 'co', 'uk', 'dev');

/** Valid, already-normalized hostname such as "youtube.com" or "news.example.co". */
const hostArb = fc
  .tuple(fc.array(labelArb, { minLength: 1, maxLength: 3 }), tldArb)
  .map(([labels, tld]) => [...labels, tld].join('.'));

const exclusionListArb = fc.uniqueArray(
  fc.oneof({ weight: 1, arbitrary: fc.constant('youtube.com') }, { weight: 4, arbitrary: hostArb }),
  { maxLength: 4 },
);

const pathArb = fc.constantFrom(
  '/',
  '',
  '/watch?v=abc123',
  '/feed/subscriptions',
  '/search?q=dark+mode',
  '/login',
  '/oauth/authorize',
  '/signin',
  '/docs/page.html#top',
);

/** Uppercases some characters so the case-insensitive part of Host_Match is exercised. */
function mixCase(host: string, mask: number): string {
  return [...host].map((ch, i) => ((mask >> i % 31) & 1 ? ch.toUpperCase() : ch)).join('');
}

/** A host derived from an exclusion entry: exact, www., subdomain (all matches) or a lookalike (no match). */
const derivedHostArb = (entry: string) =>
  fc.oneof(
    fc.constant(entry),
    fc.constant(`www.${entry}`),
    labelArb.map((l) => `${l}.${entry}`),
    fc.constant(`not${entry}`),
    fc.constant(`${entry}.evil.com`),
    fc.constant(`${entry.replace(/\./g, '-')}.net`),
  );

const httpUrlArb = (hostSource: fc.Arbitrary<string>) =>
  fc
    .tuple(fc.constantFrom('http', 'https'), hostSource, fc.integer({ min: 0, max: 0x7fffffff }), fc.boolean(), pathArb)
    .map(([scheme, host, mask, withPort, path]) => `${scheme}://${mixCase(host, mask)}${withPort ? ':8080' : ''}${path}`);

const authUrlArb = fc.constantFrom(
  'https://accounts.google.com/signin/v2/identifier',
  'https://accounts.youtube.com/accounts/SetSID',
  'https://www.google.com/recaptcha/api2/anchor',
  'https://challenges.cloudflare.com/turnstile/v0/api.js',
  'https://github.com/login',
  'https://login.microsoftonline.com/common/oauth2/authorize',
  'https://www.gstatic.com/images/branding/logo.png',
);

const nonHttpUrlArb = fc.oneof(
  fc.constantFrom('', 'neutrino://newtab', 'neutrino://settings', 'about:blank', 'about:srcdoc'),
  hostArb.map((h) => `file:///C:/Users/me/${h}.html`),
  hostArb.map((h) => `chrome://${h}`),
  fc.string({ maxLength: 20 }).filter((s) => !/https?:/i.test(s)),
);

/** A list plus a URL; most URLs are built from list entries so matches and lookalikes both show up often. */
const caseArb = exclusionListArb.chain((list) => {
  const sources: fc.Arbitrary<string>[] = [httpUrlArb(hostArb), authUrlArb, nonHttpUrlArb];
  if (list.length > 0) {
    sources.push(
      fc.constantFrom(...list).chain((entry) => httpUrlArb(derivedHostArb(entry))),
      fc.constantFrom(...list).chain((entry) => httpUrlArb(derivedHostArb(entry))),
    );
  }
  return fc.tuple(fc.constant(list), fc.oneof(...sources));
});

// ---------------------------------------------------------------------------
// Property 4
// ---------------------------------------------------------------------------

describe('Property 4: Host_Match decides DarkReader injection and nothing else changes', () => {
  // Feature: browser-settings-panel, Property 4: Host_Match decides DarkReader injection and nothing else changes
  /** **Validates: Requirements 3.6, 3.9** */
  it('skips DarkReader on a Host_Match and otherwise matches the original eligibility', () => {
    fc.assert(
      fc.property(caseArb, ([list, url]) => {
        const actual = shouldInjectDarkReader(url, list);
        if (oracleHostMatch(url, list)) {
          expect(actual).toBe(false);
        } else {
          expect(actual).toBe(originalIsDarkReaderEligible(url));
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  /** **Validates: Requirements 3.6, 3.9** */
  it('examples: matches, lookalikes and the pages that are always skipped', () => {
    const list = ['youtube.com'];
    // Host_Match: exact host, www., subdomain, any case.
    expect(shouldInjectDarkReader('https://youtube.com/', list)).toBe(false);
    expect(shouldInjectDarkReader('https://www.YouTube.com/watch?v=1', list)).toBe(false);
    expect(shouldInjectDarkReader('https://m.youtube.com/feed', list)).toBe(false);
    // Lookalikes are not matches, so the original eligibility applies.
    expect(shouldInjectDarkReader('https://notyoutube.com/', list)).toBe(true);
    expect(shouldInjectDarkReader('https://youtube.com.evil.com/', list)).toBe(true);
    expect(shouldInjectDarkReader('https://example.com/', list)).toBe(true);
    // Still skipped whatever the list holds (3.9).
    for (const l of [[], list]) {
      expect(shouldInjectDarkReader('', l)).toBe(false);
      expect(shouldInjectDarkReader('neutrino://newtab', l)).toBe(false);
      expect(shouldInjectDarkReader('about:blank', l)).toBe(false);
      expect(shouldInjectDarkReader('https://accounts.google.com/signin', l)).toBe(false);
      expect(shouldInjectDarkReader('https://example.com/login', l)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Single injector: only the main process injects DarkReader (3.10)
// ---------------------------------------------------------------------------

/** Resolved from this test file, so the check does not depend on process.cwd(). */
const RENDERER_DIR = fileURLToPath(new URL('../../src/renderer', import.meta.url));
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/i;

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listSourceFiles(full));
    else if (entry.isFile() && SOURCE_EXT.test(entry.name)) files.push(full);
  }
  return files;
}

/** `from 'darkreader'`, `from "darkreader/..."`, `import 'darkreader...'`, `require('darkreader...')`, `import('darkreader...')`. */
const DARKREADER_IMPORT =
  /(?:\bfrom\s*|\bimport\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)['"`]darkreader(?:[/?'"`])/i;
const DARKREADER_ENABLE = /\bDarkReader\s*\.\s*enable\b/;

describe('Single injector: the renderer never loads DarkReader', () => {
  /** **Validates: Requirements 3.10** */
  it('no file under src/renderer imports darkreader or calls DarkReader.enable', () => {
    const files = listSourceFiles(RENDERER_DIR);
    expect(files.length).toBeGreaterThan(0);

    const offenders = files.flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      const name = relative(RENDERER_DIR, file);
      const found: string[] = [];
      if (DARKREADER_IMPORT.test(source)) found.push(`${name}: imports darkreader`);
      if (DARKREADER_ENABLE.test(source)) found.push(`${name}: contains DarkReader.enable`);
      return found;
    });
    expect(offenders).toEqual([]);
  });

  it('the patterns catch the import forms they are meant to catch', () => {
    for (const s of [
      "import darkReaderCode from 'darkreader/darkreader.js?raw';",
      'import * as DarkReader from "DarkReader";',
      "import 'darkreader';",
      "const dr = require('darkreader');",
      "const dr = await import('darkreader/darkreader.js');",
    ]) {
      expect(DARKREADER_IMPORT.test(s), s).toBe(true);
    }
    expect(DARKREADER_IMPORT.test("import { x } from '../../main/settings';")).toBe(false);
    expect(DARKREADER_IMPORT.test("import { shouldInjectDarkReader } from '../../main/darkMode';")).toBe(false);
    expect(DARKREADER_ENABLE.test('DarkReader.enable({ brightness: 100 })')).toBe(true);
    expect(DARKREADER_ENABLE.test('window.DarkReader.disable()')).toBe(false);
  });
});
