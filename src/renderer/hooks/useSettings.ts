import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, normalizeSettings } from '../../main/settings';
import type { BrowserSettings } from '../types';

export interface UseSettingsResult {
  settings: BrowserSettings;
  updateSettings: (patch: Partial<BrowserSettings>) => Promise<void>;
}

/**
 * Browser settings owned by the main process (`browser-state.json`).
 * Returns DEFAULT_SETTINGS until the first load, and outside Electron, where updates only apply locally.
 */
export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<BrowserSettings>(() => normalizeSettings(DEFAULT_SETTINGS));

  useEffect(() => {
    const api = window.neutrino;
    let cancelled = false;

    api
      ?.getSettings?.()
      .then((loaded) => {
        if (!cancelled && loaded) setSettings(normalizeSettings(loaded));
      })
      .catch((err) => console.error('[Neutrino] Failed to load settings:', err));

    const unsubscribe = api?.onSettingsUpdated?.((next) => {
      if (!cancelled) setSettings(normalizeSettings(next));
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const updateSettings = useCallback(async (patch: Partial<BrowserSettings>) => {
    // Optimistic local update; the main process re-normalizes and broadcasts the saved result.
    setSettings((prev) => normalizeSettings({ ...prev, ...patch }));

    const api = window.neutrino;
    if (!api?.updateSettings) return;
    try {
      const saved = await api.updateSettings(patch);
      if (saved) setSettings(normalizeSettings(saved));
    } catch (err) {
      console.error('[Neutrino] Failed to update settings:', err);
      // Re-sync with the main process so the panel never shows a value that was not saved.
      try {
        const current = await api.getSettings?.();
        if (current) setSettings(normalizeSettings(current));
      } catch {
        // Keep the optimistic value; nothing else to do.
      }
    }
  }, []);

  return { settings, updateSettings };
}
