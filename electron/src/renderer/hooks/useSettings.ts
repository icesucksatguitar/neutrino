import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, normalizeSettings } from '../../main/settings';
import type { BrowserSettings } from '../types';

export interface UseSettingsResult {
  settings: BrowserSettings;
  updateSettings: (patch: Partial<BrowserSettings>) => Promise<void>;
  isLoaded: boolean;
}

const SETTINGS_CACHE_KEY = 'neutrino_settings_cache_v1';

function readCachedSettings(): BrowserSettings {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(SETTINGS_CACHE_KEY);
      if (raw) {
        return normalizeSettings(JSON.parse(raw));
      }
    }
  } catch {
    // ignore invalid cache
  }
  return normalizeSettings(DEFAULT_SETTINGS);
}

function writeCachedSettings(settings: BrowserSettings): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(settings));
    }
  } catch {
    // ignore quota/private-mode errors
  }
}

/**
 * Browser settings owned by the main process (`browser-state.json`) with instant localStorage caching.
 * Returns cached settings (or DEFAULT_SETTINGS) until main loads, then reconciles and caches updates.
 */
export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<BrowserSettings>(() => readCachedSettings());
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  useEffect(() => {
    const api = window.neutrino;
    let cancelled = false;

    if (!api?.getSettings) {
      setIsLoaded(true);
      return;
    }

    api
      .getSettings()
      .then((loaded) => {
        if (!cancelled) {
          if (loaded) {
            const normalized = normalizeSettings(loaded);
            setSettings(normalized);
            writeCachedSettings(normalized);
          }
          setIsLoaded(true);
        }
      })
      .catch((err) => {
        console.error('[Neutrino] Failed to load settings:', err);
        if (!cancelled) setIsLoaded(true);
      });

    const unsubscribe = api.onSettingsUpdated?.((next) => {
      if (!cancelled) {
        const normalized = normalizeSettings(next);
        setSettings(normalized);
        writeCachedSettings(normalized);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const updateSettings = useCallback(async (patch: Partial<BrowserSettings>) => {
    // Optimistic local update & cache write; the main process re-normalizes and broadcasts the saved result.
    setSettings((prev) => {
      const mergedPatch: Partial<BrowserSettings> = { ...patch };
      if (patch.spaceThemes && typeof patch.spaceThemes === 'object' && !Array.isArray(patch.spaceThemes)) {
        mergedPatch.spaceThemes = {
          ...(prev.spaceThemes || {}),
          ...patch.spaceThemes,
        };
      }
      const next = normalizeSettings({ ...prev, ...mergedPatch });
      writeCachedSettings(next);
      return next;
    });

    const api = window.neutrino;
    if (!api?.updateSettings) return;
    try {
      const saved = await api.updateSettings(patch);
      if (saved) {
        const normalized = normalizeSettings(saved);
        setSettings(normalized);
        writeCachedSettings(normalized);
      }
    } catch (err) {
      console.error('[Neutrino] Failed to update settings:', err);
      // Re-sync with the main process so the panel never shows a value that was not saved.
      try {
        const current = await api.getSettings?.();
        if (current) {
          const normalized = normalizeSettings(current);
          setSettings(normalized);
          writeCachedSettings(normalized);
        }
      } catch {
        // Keep the optimistic value; nothing else to do.
      }
    }
  }, []);

  return { settings, updateSettings, isLoaded };
}
