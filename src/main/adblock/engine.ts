export interface AdblockDecision {
  blocked: boolean;
  domain: string;
  category?: 'Advertising' | 'Tracker' | 'Analytics' | 'Fingerprinting' | 'Cryptomining' | 'Telemetry';
  rule?: string;
}

export interface ShieldStats {
  totalBlocked: number;
  adsBlocked: number;
  trackersBlocked: number;
  analyticsBlocked: number;
  fingerprintersBlocked: number;
  dataSavedKb: number;
}

// Built-in high-performance blocklist of tracking & advertising domains
const KNOWN_TRACKERS = new Set<string>([
  // Ad Networks & Exchanges
  'doubleclick.net',
  'googleadservices.com',
  'googlesyndication.com',
  'adservice.google.com',
  'criteo.com',
  'criteo.net',
  'adnxs.com',
  'taboola.com',
  'outbrain.com',
  'rubiconproject.com',
  'pubmatic.com',
  'openx.net',
  'amazon-adsystem.com',
  'adroll.com',
  'advertising.com',
  'bidswitch.net',
  'casalemedia.com',
  'contextweb.com',
  'indexexchange.com',
  'moatads.com',
  'smartadserver.com',
  'yieldmo.com',
  'popads.net',
  'propellerads.com',
  'adblade.com',
  'sovrn.com',
  'lijit.com',
  'media.net',
  'tribalfusion.com',
  'revcontent.com',

  // Trackers & Pixels
  'googletagmanager.com',
  'connect.facebook.net',
  'pixel.facebook.com',
  'tr.snapchat.com',
  'analytics.tiktok.com',
  'scorecardresearch.com',
  'quantserve.com',
  'imrworldwide.com',
  'chartbeat.com',
  'addthis.com',
  'sharethis.com',
  'disqus.com',
  'krxd.net',
  'bluekai.com',
  'demdex.net',
  'exelator.com',

  // Analytics & Web Telemetry
  'google-analytics.com',
  'analytics.google.com',
  'hotjar.com',
  'clarity.ms',
  'mixpanel.com',
  'segment.io',
  'amplitude.com',
  'newrelic.com',
  'nr-data.net',
  'mouseflow.com',
  'crazyegg.com',
  'statcounter.com',
  'fullstory.com',
  'heapanalytics.com',
  'loggly.com',
  'sentry.io',
  'bugsnag.com',

  // Fingerprinting & ID Harvesting
  'fingerprintjs.com',
  'fpjs.sh',
  'augur.io',
  'threatmetrix.com',
  'iovation.com',

  // Cryptominers
  'coinhive.com',
  'coin-hive.com',
  'crypto-loot.com',
  'minr.pw',
  'authedmine.com',

  // Big Tech Telemetry Endpoints
  'telemetry.mozilla.org',
  'incoming.telemetry.mozilla.org',
  'vortex.data.microsoft.com',
  'telemetry.dropbox.com',
]);

export class BraveShieldEngine {
  private enabled: boolean = true;
  private whitelist: Set<string> = new Set();
  private stats: ShieldStats = {
    totalBlocked: 0,
    adsBlocked: 0,
    trackersBlocked: 0,
    analyticsBlocked: 0,
    fingerprintersBlocked: 0,
    dataSavedKb: 0,
  };

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
  }

  public whitelistDomain(domain: string) {
    this.whitelist.add(domain.toLowerCase());
  }

  public removeWhitelistDomain(domain: string) {
    this.whitelist.delete(domain.toLowerCase());
  }

  public isWhitelisted(domain: string): boolean {
    return this.whitelist.has(domain.toLowerCase());
  }

  public getStats(): ShieldStats {
    return { ...this.stats };
  }

  public extractHost(urlStr: string): string {
    try {
      const parsed = new URL(urlStr);
      return parsed.hostname.toLowerCase();
    } catch {
      return '';
    }
  }

  public checkUrl(urlStr: string): AdblockDecision {
    if (!this.enabled) {
      return { blocked: false, domain: '' };
    }

    const host = this.extractHost(urlStr);
    if (!host) {
      return { blocked: false, domain: '' };
    }

    if (this.whitelist.has(host)) {
      return { blocked: false, domain: host, rule: 'Whitelist' };
    }

    // Check exact domain or subdomain match
    for (const tracker of KNOWN_TRACKERS) {
      if (host === tracker || host.endsWith('.' + tracker)) {
        const cat = this.categorizeDomain(tracker);
        this.recordBlock(cat);
        return {
          blocked: true,
          domain: host,
          category: cat,
          rule: `Blocklist: ${tracker}`,
        };
      }
    }

    return { blocked: false, domain: host };
  }

  public cleanUrl(urlStr: string): string {
    try {
      const url = new URL(urlStr);
      const trackingKeys = [
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_term',
        'utm_content',
        'fbclid',
        'gclid',
        'msclkid',
        'mc_eid',
        '_hsenc',
        'dclid',
        'igshid',
        'ref_',
        'ref_src',
      ];

      let modified = false;
      for (const key of trackingKeys) {
        if (url.searchParams.has(key)) {
          url.searchParams.delete(key);
          modified = true;
        }
      }

      return modified ? url.toString() : urlStr;
    } catch {
      return urlStr;
    }
  }

  private categorizeDomain(domain: string): AdblockDecision['category'] {
    if (domain.includes('coin') || domain.includes('crypto')) return 'Cryptomining';
    if (domain.includes('fingerprint') || domain.includes('fpjs')) return 'Fingerprinting';
    if (domain.includes('analytics') || domain.includes('hotjar') || domain.includes('clarity') || domain.includes('mixpanel')) return 'Analytics';
    if (domain.includes('telemetry')) return 'Telemetry';
    if (domain.includes('ad') || domain.includes('criteo') || domain.includes('doubleclick') || domain.includes('taboola') || domain.includes('outbrain')) return 'Advertising';
    return 'Tracker';
  }

  private recordBlock(category: AdblockDecision['category']) {
    this.stats.totalBlocked += 1;
    this.stats.dataSavedKb += 48; // avg request payload saved ~48KB
    switch (category) {
      case 'Advertising':
        this.stats.adsBlocked += 1;
        break;
      case 'Tracker':
        this.stats.trackersBlocked += 1;
        break;
      case 'Analytics':
      case 'Telemetry':
        this.stats.analyticsBlocked += 1;
        break;
      case 'Fingerprinting':
      case 'Cryptomining':
        this.stats.fingerprintersBlocked += 1;
        break;
    }
  }

  // Cosmetic Adblock CSS to hide intrusive ad frames and containers
  public getCosmeticFilterCSS(): string {
    return `
      div[class*="ad-box"],
      div[class*="ad_box"],
      div[class*="ad-banner"],
      div[id*="google_ads"],
      div[id*="ad-slot"],
      ins.adsbygoogle,
      iframe[src*="doubleclick.net"],
      iframe[src*="adservice"],
      .ad-container,
      .ads-banner,
      .sponsor-post {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;
  }
}
