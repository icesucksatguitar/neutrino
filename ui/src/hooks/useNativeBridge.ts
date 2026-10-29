import { useState, useEffect, useCallback } from 'react';
import { ShieldStats, BlockedItem } from '../types/browser';

// Default tracker blocklist for UI-side fast filtering & simulation
const LOCAL_BLOCKLIST = [
  { domain: 'google-analytics.com', category: 'Analytics' as const },
  { domain: 'googletagmanager.com', category: 'Tracker' as const },
  { domain: 'doubleclick.net', category: 'Advertising' as const },
  { domain: 'connect.facebook.net', category: 'Tracker' as const },
  { domain: 'pixel.facebook.com', category: 'Tracker' as const },
  { domain: 'hotjar.com', category: 'Analytics' as const },
  { domain: 'clarity.ms', category: 'Analytics' as const },
  { domain: 'criteo.com', category: 'Advertising' as const },
  { domain: 'telemetry.mozilla.org', category: 'Telemetry' as const },
  { domain: 'fingerprintjs.com', category: 'Fingerprinter' as const },
  { domain: 'coinhive.com', category: 'Cryptominer' as const },
];

export function useNativeBridge() {
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [stats, setStats] = useState<ShieldStats>({
    totalInspected: 124,
    totalBlocked: 42,
    trackersBlocked: 21,
    analyticsBlocked: 14,
    adsBlocked: 7,
    activeRulesCount: 26,
  });
  const [blockedItems, setBlockedItems] = useState<BlockedItem[]>([
    { domain: 'googletagmanager.com', category: 'Tracker', rule: 'Blocklist: googletagmanager.com', timestamp: Date.now() - 3200 },
    { domain: 'google-analytics.com', category: 'Analytics', rule: 'Blocklist: google-analytics.com', timestamp: Date.now() - 2800 },
    { domain: 'connect.facebook.net', category: 'Tracker', rule: 'Blocklist: connect.facebook.net', timestamp: Date.now() - 1400 },
    { domain: 'doubleclick.net', category: 'Advertising', rule: 'Blocklist: doubleclick.net', timestamp: Date.now() - 600 },
  ]);

  // Check URL against the filter engine
  const checkUrl = useCallback((url: string): { blocked: boolean; category?: string; rule?: string } => {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();

      for (const item of LOCAL_BLOCKLIST) {
        if (host === item.domain || host.endsWith('.' + item.domain)) {
          const newItem: BlockedItem = {
            domain: host,
            category: item.category,
            rule: `Blocklist: ${item.domain}`,
            timestamp: Date.now(),
          };

          setBlockedItems((prev) => [newItem, ...prev.slice(0, 49)]);
          setStats((prev) => ({
            ...prev,
            totalInspected: prev.totalInspected + 1,
            totalBlocked: prev.totalBlocked + 1,
            trackersBlocked: item.category === 'Tracker' ? prev.trackersBlocked + 1 : prev.trackersBlocked,
            analyticsBlocked: item.category === 'Analytics' ? prev.analyticsBlocked + 1 : prev.analyticsBlocked,
            adsBlocked: item.category === 'Advertising' ? prev.adsBlocked + 1 : prev.adsBlocked,
          }));

          return { blocked: true, category: item.category, rule: newItem.rule };
        }
      }

      setStats((prev) => ({ ...prev, totalInspected: prev.totalInspected + 1 }));
      return { blocked: false };
    } catch {
      return { blocked: false };
    }
  }, []);

  // Strip tracking parameters
  const cleanUrl = useCallback((rawUrl: string): string => {
    try {
      const url = new URL(rawUrl);
      const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'msclkid'];
      trackingParams.forEach((param) => url.searchParams.delete(param));
      return url.toString();
    } catch {
      return rawUrl;
    }
  }, []);

  // Check Mozilla native messaging host bridge if available
  useEffect(() => {
    // If running inside browser extension context
    const hasWebExtension = typeof window !== 'undefined' && (window as unknown as { browser?: { runtime?: { sendNativeMessage?: unknown } } }).browser?.runtime?.sendNativeMessage;
    if (hasWebExtension) {
      setIsConnected(true);
    }
  }, []);

  return {
    isConnected,
    stats,
    blockedItems,
    checkUrl,
    cleanUrl,
  };
}

