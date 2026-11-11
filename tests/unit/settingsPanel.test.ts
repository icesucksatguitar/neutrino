// Feature: browser-settings-panel, task 4.1: SettingsPanel markup (sections, labels, current-site action).
// Renders the real component to static HTML; effects (the Escape listener) do not run here.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SettingsPanel, type SettingsPanelProps } from '../../src/renderer/components/SettingsPanel';
import { DEFAULT_SETTINGS, normalizeSettings } from '../../src/main/settings';

const noop = () => { };

function render(overrides: Partial<SettingsPanelProps> = {}): string {
  const props: SettingsPanelProps = {
    isOpen: true,
    onClose: noop,
    settings: normalizeSettings(DEFAULT_SETTINGS),
    onUpdateSettings: noop,
    isDarkMode: true,
    onSetDarkMode: noop,
    onOpenThemeStudio: noop,
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

    it('groups controls into the four sections in order', () => {
      const titles = [...render().matchAll(/<h3 class="settings-section-title">([^<]+)<\/h3>/g)].map((m) => m[1]);
      expect(titles).toEqual(['Appearance', 'Privacy', 'Search', 'Performance']);
    });

      it('gives every button and input an aria-label', () => {
        const html = render();
        const controls = html.match(/<(button|input)\b[^>]*>/g) ?? [];
        expect(controls.length).toBeGreaterThan(8);
        for (const tag of controls) expect(tag).toMatch(/aria-label="[^"]+"/);
      });

        it('does not render any forced dark mode exclusion section', () => {
          const html = render();
          expect(html).not.toContain('Dark mode exclusions');
          expect(html).not.toContain('Exclude this site');
          expect(html).not.toContain('Use dark mode on this site');
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
