// Feature: browser-settings-panel, task 4.1: SettingsPanel markup (sections, labels, current-site action).
// Renders the real component to static HTML; effects (the Escape listener) do not run here.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SettingsPanel, type SettingsPanelProps } from '../../src/renderer/components/SettingsPanel';
import { DEFAULT_SETTINGS, normalizeSettings } from '../../src/main/settings';

const noop = () => {};

function render(overrides: Partial<SettingsPanelProps> = {}): string {
  const props: SettingsPanelProps = {
    isOpen: true,
    onClose: noop,
    settings: normalizeSettings(DEFAULT_SETTINGS),
    onUpdateSettings: noop,
    isDarkMode: true,
    onSetDarkMode: noop,
    onOpenThemeStudio: noop,
    activeTabUrl: null,
    userName: 'Ada',
    onUserNameChange: noop,
    ...overrides,
  };
  return renderToStaticMarkup(createElement(SettingsPanel, props));
}

describe('SettingsPanel', () => {
  it('renders nothing while closed', () => {
    expect(render({ isOpen: false })).toBe('');
  });

  it('builds on the shared modal classes', () => {
    const html = render();
    for (const cls of ['modal-overlay', 'modal-content-card', 'modal-header', 'modal-title', 'close-btn']) {
      expect(html).toContain(cls);
    }
  });

  it('groups controls into the five sections in order (6.3)', () => {
    const titles = [...render().matchAll(/<h3 class="settings-section-title">([^<]+)<\/h3>/g)].map((m) => m[1]);
    expect(titles).toEqual(['Appearance', 'Dark mode exclusions', 'Privacy', 'Search', 'Performance']);
  });

  it('gives every button and input an aria-label (6.2)', () => {
    const html = render({ activeTabUrl: 'https://example.com/' });
    const controls = html.match(/<(button|input)\b[^>]*>/g) ?? [];
    expect(controls.length).toBeGreaterThan(10);
    for (const tag of controls) expect(tag).toMatch(/aria-label="[^"]+"/);
  });

  it('shows one removable chip per exclusion entry (3.1)', () => {
    const html = render({ settings: normalizeSettings({ darkModeExclusions: ['youtube.com', 'github.com'] }) });
    expect(html).toContain('aria-label="Remove youtube.com"');
    expect(html).toContain('aria-label="Remove github.com"');
  });

  it('offers "Exclude this site" for an http(s) tab with no match (4.1)', () => {
    const html = render({ activeTabUrl: 'https://www.example.com/page' });
    expect(html).toContain('example.com');
    expect(html).toContain('Exclude this site');
    expect(html).not.toContain('Use dark mode on this site');
  });

  it('offers "Use dark mode on this site" when the tab host matches an entry (4.2)', () => {
    const html = render({ activeTabUrl: 'https://m.youtube.com/watch?v=1' });
    expect(html).toContain('Use dark mode on this site');
    expect(html).not.toContain('Exclude this site');
  });

  it('hides the current-site action for non-http(s) tabs (4.4)', () => {
    for (const url of ['neutrino://newtab', 'about:blank', 'file:///C:/a.html', null]) {
      const html = render({ activeTabUrl: url });
      expect(html).not.toContain('Exclude this site');
      expect(html).not.toContain('Use dark mode on this site');
    }
  });

  it('reflects the current theme, engine and switches', () => {
    const html = render({
      isDarkMode: false,
      settings: normalizeSettings({ searchEngine: 'brave', adblockEnabled: false, zenSleepEnabled: true }),
    });
    expect(html).toMatch(/aria-checked="true" aria-label="Light"/);
    expect(html).toMatch(/aria-checked="true" aria-label="Brave Search"/);
    expect(html).toMatch(/aria-checked="false" aria-label="Shields"/);
    expect(html).toMatch(/aria-checked="true" aria-label="Zen auto-sleep"/);
  });
});
