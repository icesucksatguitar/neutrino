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

export interface ShieldRequestContext {
  url: string;
  resourceType?: string;
  pageUrl?: string;
  referrer?: string;
}

export function isHostOrSubdomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function isYouTubePlaybackCritical(urlStr: string): boolean {
  if (!urlStr) return false;
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (isHostOrSubdomain(host, 'googlevideo.com')) return true;
  if (!isHostOrSubdomain(host, 'youtube.com')) return false;

  const lowerUrl = urlStr.toLowerCase();
  const pathname = parsed.pathname.toLowerCase();
  if (pathname.startsWith('/youtubei/v1/player') && !lowerUrl.includes('ad_break')) return true;
  if (pathname.startsWith('/ptracking')) return true;
  if (/^\/api\/stats\/(playback|watchtime|delayplay|atr|qoe)/.test(pathname) && !parsed.searchParams.has('adformat')) {
    return true;
  }
  return false;
}

// Built-in high-performance blocklist of tracking & advertising domains
const KNOWN_TRACKERS = new Set<string>([
  // Ad Networks & Exchanges
  'doubleclick.net',
  'googleadservices.com',
  'googlesyndication.com',
  'adservice.google.com',
  'adtrafficquality.google',
  'imasdk.googleapis.com',
  'fundingchoicesmessages.google.com',
  'doubleverify.com',
  'adsafeprotected.com',
  'criteo.com',
  'criteo.net',
  'adnxs.com',
  'taboola.com',
  'outbrain.com',
  'rubiconproject.com',
  'pubmatic.com',
  'openx.net',
  'amazon-adsystem.com',
  'mads.amazon.com',
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
  'exponential.com',
  'mgid.com',
  'zedo.com',
  'infolinks.com',
  'chitika.com',
  'adzerk.net',
  'bidvertiser.com',
  'buysellads.com',
  'carbonads.net',
  'flashtalking.com',
  'serving-sys.com',
  'sharethrough.com',
  'confiant-integrations.net',
  'yandexadexchange.net',

  // Trackers & Pixels
  'googletagmanager.com',
  'connect.facebook.net',
  'pixel.facebook.com',
  'tr.snapchat.com',
  'analytics.tiktok.com',
  'ads.tiktok.com',
  'business-api.tiktok.com',
  'ads-twitter.com',
  'ads-api.twitter.com',
  'analytics.twitter.com',
  'ads.linkedin.com',
  'px.ads.linkedin.com',
  'bat.bing.com',
  'ct.pinterest.com',
  'analytics.pinterest.com',
  'ads.reddit.com',
  'events.reddit.com',
  'alb.reddit.com',
  'pixel-config.reddit.com',
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
  'mc.yandex.ru',
  'an.yandex.ru',
  'everesttech.net',

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
  'cloudflareinsights.com',
  'browser-intake-datadoghq.com',

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

// Additional subresource-only ad/tracker domains checked when filtering page subrequests & popups
const SUBRESOURCE_TRACKERS = new Set<string>([
  '2mdn.net',
  'moatpixel.com',
  'innovid.com',
  'sizmek.com',
  'adform.net',
  'teads.tv',
  'triplelift.com',
  '33across.com',
  'kargo.com',
  'sonobi.com',
  'gumgum.com',
  'spotxchange.com',
  'spotx.tv',
  'springserve.com',
  'undertone.com',
  'connatix.com',
  'nativo.com',
  'zemanta.com',
  'yieldlove.com',
  'permutive.com',
  'id5-sync.com',
  'liadm.com',
  'liveintent.com',
  'crwdcntrl.net',
  'rlcdn.com',
  'tapad.com',
  'addthisedge.com',
  'skimlinks.com',
  'viglink.com',
  'omtrdc.net',
  '2o7.net',
  'sc-static.net',
  'appsflyer.com',
  'adjust.com',
  'branch.io',
  'kochava.com',
  'singular.net',
  'pendo.io',
  'stats.wp.com',
  'pixel.wp.com',
]);

// Hosts representing first-party SaaS dashboards users intentionally open in top-level tabs;
// blocked as third-party subresources/trackers, but allowed if navigated directly in mainFrame.
const ALLOW_TOP_LEVEL_ANALYTICS_DASHBOARDS = new Set<string>([
  'sentry.io',
  'hotjar.com',
  'clarity.ms',
  'mixpanel.com',
  'amplitude.com',
  'fullstory.com',
  'heapanalytics.com',
  'loggly.com',
  'bugsnag.com',
  'newrelic.com',
  'segment.io',
  'disqus.com',
  'pendo.io',
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
    const normalizedDomain = this.normalizeDomain(domain);
    if (normalizedDomain) this.whitelist.add(normalizedDomain);
  }

  public removeWhitelistDomain(domain: string) {
    const normalizedDomain = this.normalizeDomain(domain);
    if (normalizedDomain) this.whitelist.delete(normalizedDomain);
  }

  public isWhitelisted(domain: string): boolean {
    const normalizedDomain = this.normalizeDomain(domain);
    if (!normalizedDomain) return false;

    for (const allowedDomain of this.whitelist) {
      if (normalizedDomain === allowedDomain || normalizedDomain.endsWith(`.${allowedDomain}`)) {
        return true;
      }
    }
    return false;
  }

  public setWhitelist(domains: string[]) {
    this.whitelist.clear();
    for (const domain of domains) {
      this.whitelistDomain(domain);
    }
  }

  public getWhitelist(): string[] {
    return Array.from(this.whitelist.values()).sort();
  }

  public getStats(): ShieldStats {
    return { ...this.stats };
  }

  public resetStats(): ShieldStats {
    this.stats = {
      totalBlocked: 0,
      adsBlocked: 0,
      trackersBlocked: 0,
      analyticsBlocked: 0,
      fingerprintersBlocked: 0,
      dataSavedKb: 0,
    };
    return this.getStats();
  }

  public extractHost(urlStr: string): string {
    try {
      const parsed = new URL(urlStr);
      return parsed.hostname.toLowerCase();
    } catch {
      return '';
    }
  }

  private lookupDomainInSet(host: string, domainSet: Set<string>): string | null {
    let currentDomain = host;
    while (currentDomain) {
      if (domainSet.has(currentDomain)) {
        return currentDomain;
      }
      const dotIndex = currentDomain.indexOf('.');
      if (dotIndex === -1) break;
      currentDomain = currentDomain.substring(dotIndex + 1);
    }
    return null;
  }

  public checkUrl(urlStr: string): AdblockDecision {
    if (!this.enabled) {
      return { blocked: false, domain: '' };
    }

    const host = this.extractHost(urlStr);
    if (!host) {
      return { blocked: false, domain: '' };
    }

    if (this.isWhitelisted(host)) {
      return { blocked: false, domain: host, rule: 'Whitelist' };
    }

    // High-speed O(1) domain & subdomain suffix lookup
    const matchedDomain = this.lookupDomainInSet(host, KNOWN_TRACKERS);
    if (matchedDomain) {
      const cat = this.categorizeDomain(matchedDomain);
      this.recordBlock(cat);
      return {
        blocked: true,
        domain: host,
        category: cat,
        rule: `Blocklist: ${matchedDomain}`,
      };
    }

    // Allow playback-critical YouTube requests, but NOT YouTube ad requests (/ad_break, ?adformat=)
    if (isYouTubePlaybackCritical(urlStr)) {
      return { blocked: false, domain: host };
    }

    const lowerUrl = urlStr.toLowerCase();

    // Check URL path and query patterns for in-page ad networks, YouTube video ads, and telemetry
    if (
      lowerUrl.includes('/pagead/') ||
      lowerUrl.includes('/api/stats/ads') ||
      lowerUrl.includes('googleads.g.doubleclick.net') ||
      lowerUrl.includes('securepubads.g.doubleclick.net') ||
      lowerUrl.includes('pagead2.googlesyndication.com') ||
      lowerUrl.includes('/ads/vpaid') ||
      lowerUrl.includes('/get_midroll_info') ||
      lowerUrl.includes('/ads?client=') ||
      lowerUrl.includes('youtubei/v1/player/ad_break') ||
      lowerUrl.includes('youtube.com/api/stats/qoe?adformat=') ||
      lowerUrl.includes('adnxs.com') ||
      lowerUrl.includes('rubiconproject.com') ||
      lowerUrl.includes('doubleclick.net') ||
      lowerUrl.includes('adservice.google') ||
      lowerUrl.includes('taboola.com') ||
      lowerUrl.includes('outbrain.com') ||
      lowerUrl.includes('criteo.com') ||
      lowerUrl.includes('scorecardresearch.com')
    ) {
      this.recordBlock('Advertising');
      return {
        blocked: true,
        domain: host,
        category: 'Advertising',
        rule: 'Pattern: ad-endpoint',
      };
    }

    return { blocked: false, domain: host };
  }

  /**
   * Context-aware network request check used by Electron `onBeforeRequest` and popup blocking.
   * Respects page/initiator site whitelisting, avoids breaking top-level dashboard visits,
   * and applies extended EasyList/EasyPrivacy subresource filters without changing `checkUrl` semantics.
   */
  public checkRequest(ctx: ShieldRequestContext): AdblockDecision {
    if (!this.enabled) {
      return { blocked: false, domain: '' };
    }

    const host = this.extractHost(ctx.url);
    if (!host) {
      return { blocked: false, domain: '' };
    }

    const resourceType = ctx.resourceType || '';
    const isTopLevelNavigation = resourceType === 'mainFrame';

    // Per-site whitelist applies to the target site AND subresources initiated from a whitelisted page
    if (this.isWhitelisted(host)) {
      return { blocked: false, domain: host, rule: 'Whitelist' };
    }
    if (!isTopLevelNavigation) {
      const pageHost = ctx.pageUrl ? this.extractHost(ctx.pageUrl) : '';
      const refHost = ctx.referrer ? this.extractHost(ctx.referrer) : '';
      if ((pageHost && this.isWhitelisted(pageHost)) || (refHost && this.isWhitelisted(refHost))) {
        return { blocked: false, domain: host, rule: 'Whitelist' };
      }
    }

    // Do not break top-level user visits to first-party developer/analytics dashboards
    if (isTopLevelNavigation && this.lookupDomainInSet(host, ALLOW_TOP_LEVEL_ANALYTICS_DASHBOARDS)) {
      return { blocked: false, domain: host };
    }

    // Run core URL check
    const baseDecision = this.checkUrl(ctx.url);
    if (baseDecision.blocked) {
      return baseDecision;
    }

    if (isYouTubePlaybackCritical(ctx.url)) {
      return { blocked: false, domain: host };
    }

    // Subresource-specific rules (scripts, xhr/fetch, subframes, images, beacons, popups)
    if (!isTopLevelNavigation) {
      const subMatch = this.lookupDomainInSet(host, SUBRESOURCE_TRACKERS);
      if (subMatch) {
        const cat = this.categorizeDomain(subMatch);
        this.recordBlock(cat);
        return {
          blocked: true,
          domain: host,
          category: cat,
          rule: `Blocklist: ${subMatch}`,
        };
      }

      const lowerUrl = ctx.url.toLowerCase();

      // Catch YouTube QOE ad beacons even when `adformat` appears later in the query string
      if (isHostOrSubdomain(host, 'youtube.com') && lowerUrl.includes('/api/stats/qoe') && lowerUrl.includes('adformat=')) {
        this.recordBlock('Advertising');
        return {
          blocked: true,
          domain: host,
          category: 'Advertising',
          rule: 'Pattern: youtube-ad-qoe',
        };
      }

      // Extended EasyList/EasyPrivacy subresource patterns
      if (
        lowerUrl.includes('/gampad/ads') ||
        lowerUrl.includes('/pcs/activeview') ||
        lowerUrl.includes('/pagead/js/adsbygoogle') ||
        lowerUrl.includes('/gpt/pubads_impl') ||
        lowerUrl.includes('/adserver/') ||
        lowerUrl.includes('/adsystem/') ||
        lowerUrl.includes('/ad_banner') ||
        lowerUrl.includes('/banner_ads/') ||
        lowerUrl.includes('/banner-ads/') ||
        lowerUrl.includes('/sponsored-ads/') ||
        lowerUrl.includes('/ima3.js') ||
        lowerUrl.includes('/prebid.js') ||
        lowerUrl.includes('/prebid-min.js') ||
        lowerUrl.includes('/fbevents.js') ||
        lowerUrl.includes('/gtag/js') ||
        lowerUrl.includes('/gtm.js') ||
        lowerUrl.includes('/analytics.js') ||
        lowerUrl.includes('/collect?v=2&tid=') ||
        lowerUrl.includes('/telemetry/v1/')
      ) {
        const isTelemetry =
          lowerUrl.includes('/gtag/js') ||
          lowerUrl.includes('/gtm.js') ||
          lowerUrl.includes('/analytics.js') ||
          lowerUrl.includes('/collect?v=2&tid=') ||
          lowerUrl.includes('/telemetry/v1/') ||
          lowerUrl.includes('/fbevents.js');
        const category = isTelemetry ? 'Analytics' : 'Advertising';
        this.recordBlock(category);
        return {
          blocked: true,
          domain: host,
          category,
          rule: isTelemetry ? 'Pattern: tracker-script' : 'Pattern: subresource-ad',
        };
      }

      // Block third-party ping/tracking beacons
      if (resourceType === 'ping') {
        const originHost = ctx.pageUrl ? this.extractHost(ctx.pageUrl) : '';
        if (originHost && originHost !== host && !host.endsWith(`.${originHost}`) && !originHost.endsWith(`.${host}`)) {
          this.recordBlock('Telemetry');
          return {
            blocked: true,
            domain: host,
            category: 'Telemetry',
            rule: 'Pattern: tracking-ping',
          };
        }
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
    if (
      domain.includes('analytics') ||
      domain.includes('hotjar') ||
      domain.includes('clarity') ||
      domain.includes('mixpanel') ||
      domain.includes('insights') ||
      domain.includes('datadog') ||
      domain.includes('pendo')
    ) {
      return 'Analytics';
    }
    if (domain.includes('telemetry')) return 'Telemetry';
    if (
      domain.includes('ad') ||
      domain.includes('criteo') ||
      domain.includes('doubleclick') ||
      domain.includes('taboola') ||
      domain.includes('outbrain') ||
      domain.includes('doubleverify') ||
      domain.includes('moat') ||
      domain.includes('innovid') ||
      domain.includes('sizmek') ||
      domain.includes('flashtalking') ||
      domain.includes('teads') ||
      domain.includes('triplelift') ||
      domain.includes('sharethrough') ||
      domain.includes('connatix') ||
      domain.includes('nativo') ||
      domain.includes('zemanta') ||
      domain.includes('yieldlove')
    ) {
      return 'Advertising';
    }
    return 'Tracker';
  }

  private normalizeDomain(domain: string): string {
    const value = domain.trim().toLowerCase();
    if (!value) return '';

    try {
      const parsed = value.includes('://') ? new URL(value) : new URL(`https://${value}`);
      return parsed.hostname.replace(/\.$/, '');
    } catch {
      return value.replace(/^\.+|\.+$/g, '');
    }
  }

  private recordBlock(category: AdblockDecision['category']) {
    this.stats.totalBlocked += 1;
    this.stats.dataSavedKb += 54; // avg request payload saved ~54KB
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

  // Cosmetic Adblock CSS to hide intrusive ad frames and banners (without breaking the native video player)
  public getCosmeticFilterCSS(): string {
    return `
      div[class*="ad-box"],
      div[class*="ad_box"],
      div[class*="ad-banner"],
      div[class*="ad_banner"],
      div[id*="google_ads"],
      div[id^="div-gpt-ad"],
      div[id*="ad-slot"],
      [data-ad-slot],
      ins.adsbygoogle,
      iframe[src*="doubleclick.net"],
      iframe[src*="googlesyndication.com"],
      iframe[src*="adservice"],
      iframe[src*="taboola.com"],
      iframe[src*="outbrain.com"],
      .ad-container,
      .ad-slot,
      .ads-banner,
      .advertisement,
      .sponsored-content,
      .sponsor-post,
      ytd-ad-slot-renderer,
      ytd-rich-item-renderer:has(ytd-ad-slot-renderer),
      ytd-in-feed-ad-layout-renderer,
      ytd-banner-promo-renderer-background,
      ytd-statement-banner-renderer,
      #masthead-ad,
      ytd-companion-slot-renderer,
      ytd-action-companion-ad-renderer,
      ytd-promoted-sparkles-web-renderer,
      ytd-display-ad-renderer,
      ytd-promoted-video-renderer,
      .ytp-ad-module,
      .ytp-ad-image-overlay,
      .ytp-ad-text-overlay,
      .ytp-ad-player-overlay-layout,
      .ytp-ad-overlay-container,
      #player-ads {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;
  }

  // Safe client-side scriptlet to skip/accelerate YouTube ads without breaking real video playback,
  // and cleanly respond to live shields toggle / site whitelist updates.
  public getYouTubeAdSkipperScript(): string {
    return `
      (() => {
        window.__neutrino_shields_active = true;
        if (window.__neutrino_ad_skipper_injected) {
          if (typeof window.__neutrino_run_ad_skip_tick === 'function') {
            window.__neutrino_run_ad_skip_tick();
          }
          return;
        }
        window.__neutrino_ad_skipper_injected = true;

        let savedPlayback = null;
        const skipSelector = '.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, button.ytp-ad-skip-button, .ytp-ad-overlay-close-button';
        const overlaySelector = '.ytp-ad-overlay-container, ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, #player-ads, #masthead-ad, ytd-companion-slot-renderer';

        const runTick = () => {
          try {
            const player = document.querySelector('#movie_player, .html5-video-player');
            const video = document.querySelector('video');

            if (window.__neutrino_shields_active === false) {
              if (savedPlayback && video) {
                video.playbackRate = savedPlayback.rate;
                video.muted = savedPlayback.muted;
                savedPlayback = null;
              }
              return;
            }

            const inAd = !!(player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting')));
            if (inAd) {
              if (video) {
                if (!savedPlayback) {
                  savedPlayback = { rate: video.playbackRate, muted: video.muted };
                }
                video.muted = true;
                video.playbackRate = 16;
              }
            } else if (savedPlayback) {
              if (video) {
                video.playbackRate = savedPlayback.rate;
                video.muted = savedPlayback.muted;
              }
              savedPlayback = null;
            }

            const skipButtons = document.querySelectorAll(skipSelector);
            skipButtons.forEach((btn) => {
              if (btn && typeof btn.click === 'function') {
                btn.click();
              }
            });

            const overlays = document.querySelectorAll(overlaySelector);
            overlays.forEach((el) => {
              if (el && el.style) {
                el.style.display = 'none';
              }
            });
          } catch (e) {}
        };

        window.__neutrino_run_ad_skip_tick = runTick;

        const target = document.body || document.documentElement;
        if (target && typeof MutationObserver !== 'undefined') {
          let scheduled = false;
          const obs = new MutationObserver(() => {
            if (scheduled || window.__neutrino_shields_active === false) return;
            scheduled = true;
            setTimeout(() => {
              scheduled = false;
              runTick();
            }, 60);
          });
          obs.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
        }

        runTick();
        setInterval(runTick, 350);
      })();
    `;
  }
}
