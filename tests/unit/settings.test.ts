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
  buildSearchUrl,
  normalizeSettings,
  type SearchEngineId,
} from '../../src/main/settings';

const RUNS = { numRuns: 200 };

const KNOWN_KEYS = ['adblockEnabled', 'zenSleepEnabled', 'searchEngine'] as const;
const ENGINE_IDS = Object.keys(SEARCH_ENGINES) as SearchEngineId[];

function isSearchEngineId(value: unknown): value is SearchEngineId {
  return typeof value === 'string' && (ENGINE_IDS as string[]).includes(value);
}

const extraKeyArb = fc
  .string({ minLength: 1, maxLength: 12 })
  .filter((k) => !(KNOWN_KEYS as readonly string[]).includes(k) && k !== '__proto__');

const settingsObjectArb = fc
  .tuple(
    fc.record(
      {
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

        // Total: the known fields are always valid.
        expect(typeof out.adblockEnabled).toBe('boolean');
        expect(typeof out.zenSleepEnabled).toBe('boolean');
        expect(isSearchEngineId(out.searchEngine)).toBe(true);

        const source =
          raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

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

      it('uses default values when no settings have been saved', () => {
        for (const raw of [undefined, null, {}, 'corrupt', 42, []]) {
          expect(normalizeSettings(raw)).toMatchObject({
            adblockEnabled: true,
            zenSleepEnabled: true,
            searchEngine: 'google',
          });
        }
      });

      it('maps a legacy search URL prefix to its engine id and keeps the legacy theme key', () => {
        const out = normalizeSettings({ searchEngine: 'https://www.google.com/search?q=', theme: 'dark' });
        expect(out.searchEngine).toBe('google');
        expect(out.theme).toBe('dark');
        expect(normalizeSettings({ searchEngine: 'https://duckduckgo.com/?q=' }).searchEngine).toBe('duckduckgo');
        expect(normalizeSettings({ searchEngine: 'https://example.com/?q=' }).searchEngine).toBe('google');
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
