/**
 * Browser settings panel tests (spec: browser-settings-panel).
 *
 * Each property lives in its own describe block, tagged
 * `Feature: browser-settings-panel, Property N: <title>`. Example-based checks sit next to the
 * property they illustrate.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  DEFAULT_SETTINGS,
  SEARCH_ENGINES,
  addExclusion,
  buildSearchUrl,
  hostForExclusion,
  hostMatches,
  isHostExcluded,
  normalizeHostEntry,
  normalizeSettings,
  removeExclusion,
  toggleSiteExclusion,
  type SearchEngineId,
} from '../../src/main/settings';

const RUNS = { numRuns: 200 };

const KNOWN_KEYS = ['darkModeExclusions', 'adblockEnabled', 'zenSleepEnabled', 'searchEngine'] as const;
const ENGINE_IDS = Object.keys(SEARCH_ENGINES) as SearchEngineId[];

/** A list normalizeSettings must keep as is: strings already in canonical form, no duplicates. */
function isKeptExclusionList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((e) => typeof e === 'string' && normalizeHostEntry(e) === e) &&
    new Set(value).size === value.length
  );
}

function isSearchEngineId(value: unknown): value is SearchEngineId {
  return typeof value === 'string' && (ENGINE_IDS as string[]).includes(value);
}

// Canonical hostnames (lowercase, no leading "www." that could be stripped, valid labels).
const canonicalHostArb = fc.domain().filter((d) => normalizeHostEntry(d) === d);
const validExclusionsArb = fc.uniqueArray(canonicalHostArb, { maxLength: 6 });
// Lists that need cleaning: decorated, invalid, duplicate and non-string entries.
const messyExclusionsArb = fc.array(
  fc.oneof(
    canonicalHostArb,
    canonicalHostArb.map((h) => `https://WWW.${h.toUpperCase()}:8080/path?q=1`),
    fc.string(),
    fc.anything(),
  ),
  { maxLength: 6 },
);

const extraKeyArb = fc
  .string({ minLength: 1, maxLength: 12 })
  .filter((k) => !(KNOWN_KEYS as readonly string[]).includes(k) && k !== '__proto__');

const settingsObjectArb = fc
  .tuple(
    fc.record(
      {
        darkModeExclusions: fc.oneof(validExclusionsArb, messyExclusionsArb, fc.anything()),
        adblockEnabled: fc.oneof(fc.boolean(), fc.anything()),
        zenSleepEnabled: fc.oneof(fc.boolean(), fc.anything()),
        searchEngine: fc.oneof(
          fc.constantFrom(...ENGINE_IDS),
          fc.constantFrom(...ENGINE_IDS.map((id) => SEARCH_ENGINES[id].prefix)),
          fc.string(),
          fc.anything(),
        ),
      },
      { requiredKeys: [] },
    ),
    fc.dictionary(extraKeyArb, fc.anything(), { maxKeys: 5 }),
  )
  .map(([known, extra]) => ({ ...extra, ...known }) as Record<string, unknown>);

// Any value at all, including undefined, primitives, arrays and objects with random keys.
const rawArb: fc.Arbitrary<unknown> = fc.oneof(settingsObjectArb, fc.anything());

describe('Feature: browser-settings-panel, Property 1: Settings normalization is total, keeps valid data and is idempotent', () => {
  // **Validates: Requirements 2.2, 2.3, 2.5**
  it('returns valid known fields, keeps valid data and unknown keys, and is idempotent', () => {
    fc.assert(
      fc.property(rawArb, (raw) => {
        const out = normalizeSettings(raw);

        // Total: the four known fields are always valid.
        expect(isKeptExclusionList(out.darkModeExclusions)).toBe(true);
        expect(typeof out.adblockEnabled).toBe('boolean');
        expect(typeof out.zenSleepEnabled).toBe('boolean');
        expect(isSearchEngineId(out.searchEngine)).toBe(true);

        const source =
          raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

        // Valid known fields are kept; missing or non-array exclusions fall back to the default list.
        if (isKeptExclusionList(source.darkModeExclusions)) {
          expect(out.darkModeExclusions).toEqual(source.darkModeExclusions);
        } else if (!Array.isArray(source.darkModeExclusions)) {
          expect(out.darkModeExclusions).toEqual(DEFAULT_SETTINGS.darkModeExclusions);
        }
        if (typeof source.adblockEnabled === 'boolean') expect(out.adblockEnabled).toBe(source.adblockEnabled);
        else expect(out.adblockEnabled).toBe(DEFAULT_SETTINGS.adblockEnabled);
        if (typeof source.zenSleepEnabled === 'boolean') expect(out.zenSleepEnabled).toBe(source.zenSleepEnabled);
        else expect(out.zenSleepEnabled).toBe(DEFAULT_SETTINGS.zenSleepEnabled);
        if (isSearchEngineId(source.searchEngine)) expect(out.searchEngine).toBe(source.searchEngine);

        // Unknown keys are kept unchanged (same value, by identity).
        for (const key of Object.keys(source)) {
          if ((KNOWN_KEYS as readonly string[]).includes(key)) continue;
          expect(Object.prototype.hasOwnProperty.call(out, key)).toBe(true);
          expect(Object.is(out[key], source[key])).toBe(true);
        }

        // Idempotent.
        expect(normalizeSettings(out)).toEqual(out);
      }),
      RUNS,
    );
  });

  it('uses the default list ["youtube.com"] when no list has been saved', () => {
    expect(DEFAULT_SETTINGS.darkModeExclusions).toEqual(['youtube.com']);
    for (const raw of [undefined, null, {}, 'corrupt', 42, [], { darkModeExclusions: 'youtube.com' }]) {
      expect(normalizeSettings(raw)).toMatchObject({
        darkModeExclusions: ['youtube.com'],
        adblockEnabled: true,
        zenSleepEnabled: true,
        searchEngine: 'google',
      });
    }
  });

  it('keeps an explicitly empty saved list empty', () => {
    expect(normalizeSettings({ darkModeExclusions: [] }).darkModeExclusions).toEqual([]);
  });

  it('maps a legacy search URL prefix to its engine id and keeps the legacy theme key', () => {
    const out = normalizeSettings({ searchEngine: 'https://www.google.com/search?q=', theme: 'dark' });
    expect(out.searchEngine).toBe('google');
    expect(out.theme).toBe('dark');
    expect(normalizeSettings({ searchEngine: 'https://duckduckgo.com/?q=' }).searchEngine).toBe('duckduckgo');
    expect(normalizeSettings({ searchEngine: 'https://example.com/?q=' }).searchEngine).toBe('google');
  });
});

// A canonical host `h` with any mix of the decorations a user might paste: random letter case, a
// scheme, a leading "www.", a port, a path and a query. `h` never starts with a strippable "www."
// (canonicalHostArb), so adding "www." in front always normalizes back to `h`; hosts like "www.com"
// stay as is both with and without the extra prefix.
const decoratedHostArb = fc
  .record({
    h: canonicalHostArb,
    scheme: fc.constantFrom('', 'http://', 'https://', 'HTTPS://'),
    www: fc.boolean(),
    port: fc.option(fc.integer({ min: 0, max: 65535 }), { nil: undefined }),
    path: fc.option(fc.webPath(), { nil: undefined }),
    query: fc.option(fc.webQueryParameters(), { nil: undefined }),
  })
  .chain((parts) => {
    const raw =
      parts.scheme +
      (parts.www ? 'www.' : '') +
      parts.h +
      (parts.port === undefined ? '' : `:${parts.port}`) +
      (parts.path === undefined ? '' : parts.path.startsWith('/') ? parts.path : `/${parts.path}`) +
      (parts.query === undefined ? '' : `?${parts.query}`);
    return fc.mixedCase(fc.constant(raw)).map((decorated) => ({ h: parts.h, decorated }));
  });

// ASCII characters a hostname label can never contain and that the parser does not treat as a
// delimiter (no '/', '?', '#', '@', ':' or '.').
const INVALID_HOST_CHARS = ['_', '!', '$', '*', '(', ')', ',', ';', '=', '"', "'", '<', '>', '{', '}', '|', '~', '^', '`', '%', '&', '+', '[', ']', '\\'];
const whitespaceArb = fc.string({ unit: fc.constantFrom(' ', '\t', '\n', '\r'), minLength: 1, maxLength: 5 });

// Strings with no valid hostname: empty, whitespace only, a space inside, or an invalid character.
const invalidHostInputArb = fc.oneof(
  fc.constant(''),
  whitespaceArb,
  fc.tuple(canonicalHostArb, whitespaceArb, canonicalHostArb).map(([a, ws, b]) => `${a}${ws}${b}`),
  fc
    .tuple(canonicalHostArb, fc.constantFrom(...INVALID_HOST_CHARS), fc.nat())
    .map(([h, c, i]) => {
      const at = i % (h.length + 1);
      return h.slice(0, at) + c + h.slice(at);
    }),
);

describe('Feature: browser-settings-panel, Property 2: Exclusion entries normalize to one canonical hostname', () => {
  // **Validates: Requirements 3.2, 3.3**
  it('normalizes any decoration of a host to the host, and adding it again leaves the list unchanged', () => {
    fc.assert(
      fc.property(decoratedHostArb, validExclusionsArb, ({ h, decorated }, others) => {
        expect(normalizeHostEntry(decorated)).toBe(h);

        const list = others.includes(h) ? others : [...others, h];
        const result = addExclusion(list, decorated);
        expect(result.error).toBeUndefined();
        expect(result.list).toEqual(list);
      }),
      RUNS,
    );
  });

  it('rejects input with no valid hostname and leaves the list unchanged', () => {
    fc.assert(
      fc.property(invalidHostInputArb, validExclusionsArb, (input, list) => {
        expect(normalizeHostEntry(input)).toBeNull();
        expect(addExclusion(list, input)).toEqual({ list, error: 'invalid-host' });
      }),
      RUNS,
    );
  });

  it('normalizes typical pasted addresses', () => {
    expect(normalizeHostEntry('https://www.YouTube.com:443/watch?v=1')).toBe('youtube.com');
    expect(normalizeHostEntry('  Example.ORG/path  ')).toBe('example.org');
    expect(normalizeHostEntry('www.com')).toBe('www.com');
    expect(addExclusion(['youtube.com'], 'http://WWW.youtube.com/')).toEqual({ list: ['youtube.com'] });
    expect(addExclusion(['youtube.com'], 'not a host')).toEqual({ list: ['youtube.com'], error: 'invalid-host' });
  });
});

// An http(s) URL on canonical host `h`: random scheme case, optional "www.", port, path and query.
const siteUrlArb = fc
  .record({
    h: canonicalHostArb,
    scheme: fc.constantFrom('http://', 'https://', 'HTTPS://'),
    www: fc.boolean(),
    port: fc.option(fc.integer({ min: 1, max: 65535 }), { nil: undefined }),
    path: fc.option(fc.webPath(), { nil: undefined }),
    query: fc.option(fc.webQueryParameters(), { nil: undefined }),
  })
  .map((parts) => ({
    h: parts.h,
    url:
      parts.scheme +
      (parts.www ? 'www.' : '') +
      parts.h +
      (parts.port === undefined ? '' : `:${parts.port}`) +
      (parts.path === undefined ? '/' : parts.path.startsWith('/') ? parts.path : `/${parts.path}`) +
      (parts.query === undefined ? '' : `?${parts.query}`),
  }));

// A host `h`, a URL on it, and a list `L` with no Host_Match for `h` (no entry equals `h` or is a
// parent domain of it). Entries that are subdomains of `h` do not match `h` and may stay.
const hostAndUnmatchedListArb = fc
  .tuple(siteUrlArb, validExclusionsArb)
  .map(([{ h, url }, list]) => ({ h, url, list: list.filter((e) => !hostMatches(h, e)) }));

describe('Feature: browser-settings-panel, Property 3: Add, remove and toggle are inverse operations', () => {
  // **Validates: Requirements 3.4, 4.3, 4.4**
  it('removing an added host restores the list, and toggling twice restores the list', () => {
    fc.assert(
      fc.property(hostAndUnmatchedListArb, ({ h, url, list }) => {
        // Add then remove.
        const added = addExclusion(list, h);
        expect(added.error).toBeUndefined();
        expect(added.list).toEqual([...list, h]);
        expect(removeExclusion(added.list, h)).toEqual(list);

        // The URL resolves to `h`, and `h` is not excluded before the first toggle.
        expect(hostForExclusion(url)).toBe(h);
        expect(isHostExcluded(url, list)).toBe(false);

        // One toggle excludes the site, a second toggle restores the list.
        const once = toggleSiteExclusion(list, url);
        expect(isHostExcluded(url, once)).toBe(true);
        expect(toggleSiteExclusion(once, url)).toEqual(list);
      }),
      RUNS,
    );
  });

  it('returns null from hostForExclusion for non-http(s) URLs, and toggling them leaves the list unchanged', () => {
    const list = ['youtube.com', 'example.org'];
    for (const url of ['neutrino://settings', 'neutrino://newtab', 'about:blank', 'file:///C:/Users/me/page.html', 'chrome://settings', 'not a url', '']) {
      expect(hostForExclusion(url)).toBeNull();
      expect(isHostExcluded(url, list)).toBe(false);
      expect(toggleSiteExclusion(list, url)).toEqual(list);
    }
  });

  it('toggling a subdomain of an excluded entry removes the matching parent entry', () => {
    expect(toggleSiteExclusion(['youtube.com', 'example.org'], 'https://music.youtube.com/watch')).toEqual(['example.org']);
    expect(toggleSiteExclusion(['example.org'], 'https://www.YouTube.com/')).toEqual(['example.org', 'youtube.com']);
    expect(removeExclusion(['youtube.com', 'example.org'], 'https://www.youtube.com/')).toEqual(['example.org']);
  });
});

// Well-formed query strings: any Unicode code point outside the surrogate range (so astral
// characters appear as valid pairs), grapheme clusters, and ASCII heavy on URL-special characters.
const URL_SPECIAL_CHARS = ['&', '?', '#', '+', '%', ' ', '=', '/', ':', '@', ';', ',', '"', "'", '<', '>', '\\', '\t', '\n'];
const queryArb = fc.oneof(
  fc.string({ unit: 'binary' }),
  fc.string({ unit: 'grapheme' }),
  fc.string({ unit: fc.oneof(fc.constantFrom(...URL_SPECIAL_CHARS), fc.string({ minLength: 1, maxLength: 1 })) }),
);

describe('Feature: browser-settings-panel, Property 5: Search URLs round-trip the query', () => {
  // **Validates: Requirements 5.7**
  it('starts with the engine prefix, and decoding the remainder returns the query', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ENGINE_IDS), queryArb, (engine, query) => {
        const url = buildSearchUrl(engine, query);
        const prefix = SEARCH_ENGINES[engine].prefix;
        expect(url.startsWith(prefix)).toBe(true);
        expect(decodeURIComponent(url.slice(prefix.length))).toBe(query);
      }),
      RUNS,
    );
  });

  it('encodes URL-special characters so they cannot leak into the URL structure', () => {
    expect(buildSearchUrl('google', 'a&b=c #d?e+f%')).toBe('https://www.google.com/search?q=a%26b%3Dc%20%23d%3Fe%2Bf%25');
    expect(buildSearchUrl('duckduckgo', '')).toBe('https://duckduckgo.com/?q=');
  });

  it('does not throw on a lone surrogate and keeps the engine prefix', () => {
    for (const engine of ENGINE_IDS) {
      const url = buildSearchUrl(engine, 'a\uD800b');
      expect(url).toBe(`${SEARCH_ENGINES[engine].prefix}a%EF%BF%BDb`);
      expect(decodeURIComponent(url.slice(SEARCH_ENGINES[engine].prefix.length))).toBe('a\uFFFDb');
    }
  });
});
