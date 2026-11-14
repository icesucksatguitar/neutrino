import { describe, expect, it } from 'vitest';
import { BraveShieldEngine, isYouTubePlaybackCritical } from '../../src/main/adblock/engine';
import { createAdController } from '../../src/main/adblock/youtubeAdController';
import { normalizeSettings } from '../../src/main/settings';

describe('Issue #3: BraveShieldEngine & YouTube AdController', () => {
  it('blocks known ad/tracker domains while keeping playback-critical YouTube requests unblocked', () => {
    const engine = new BraveShieldEngine();

    expect(engine.checkUrl('https://imasdk.googleapis.com/js/sdkloader/ima3.js').blocked).toBe(true);
    expect(engine.checkUrl('https://fundingchoicesmessages.google.com/el/AGSK...').blocked).toBe(true);
    expect(engine.checkUrl('https://ads.reddit.com/api/v2/pixel').blocked).toBe(true);
    expect(engine.checkUrl('https://static.cloudflareinsights.com/beacon.min.js').blocked).toBe(true);

    // YouTube ad break and ad QOE must be blocked
    expect(engine.checkUrl('https://www.youtube.com/youtubei/v1/player/ad_break?key=abc').blocked).toBe(true);
    expect(engine.checkUrl('https://www.youtube.com/api/stats/qoe?adformat=15_2_1&cpn=xyz').blocked).toBe(true);

    // Real YouTube playback endpoints must pass
    expect(isYouTubePlaybackCritical('https://rr3---sn-4g5e6nls.googlevideo.com/videoplayback?id=1')).toBe(true);
    expect(engine.checkUrl('https://rr3---sn-4g5e6nls.googlevideo.com/videoplayback?id=1').blocked).toBe(false);
    expect(engine.checkUrl('https://www.youtube.com/youtubei/v1/player?cpn=xyz').blocked).toBe(false);
    expect(engine.checkUrl('https://www.youtube.com/api/stats/qoe?cpn=xyz&fmt=248').blocked).toBe(false);
    expect(engine.checkUrl('https://www.youtube.com/ptracking?ei=123').blocked).toBe(false);
  });

  it('respects first-party site whitelisting and blocks subresource ads/pings in checkRequest', () => {
    const engine = new BraveShieldEngine();

    // Third-party ad script, analytics script, mid-query QOE ad beacon, and cross-site ping are blocked
    expect(
      engine.checkRequest({
        url: 'https://cdn.example.net/ads/gampad/ads?sz=300x250',
        resourceType: 'script',
        pageUrl: 'https://news.example.com/story',
      }).blocked,
    ).toBe(true);
    expect(
      engine.checkRequest({
        url: 'https://www.youtube.com/api/stats/qoe?cpn=abc&adformat=15_2_1',
        resourceType: 'xhr',
        pageUrl: 'https://www.youtube.com/watch?v=1',
      }).blocked,
    ).toBe(true);
    expect(
      engine.checkRequest({
        url: 'https://metrics-other.org/event',
        resourceType: 'ping',
        pageUrl: 'https://news.example.com/story',
      }).blocked,
    ).toBe(true);

    // Top-level navigation to developer analytics dashboard is allowed; third-party subresource is blocked
    expect(
      engine.checkRequest({
        url: 'https://sentry.io/organizations/demo/issues/',
        resourceType: 'mainFrame',
      }).blocked,
    ).toBe(false);
    expect(
      engine.checkRequest({
        url: 'https://sentry.io/api/123/store/',
        resourceType: 'xhr',
        pageUrl: 'https://news.example.com/story',
      }).blocked,
    ).toBe(true);

    // Whitelisting news.example.com unblocks subresources loaded on that site
    engine.whitelistDomain('https://news.example.com/story');
    expect(engine.isWhitelisted('sub.news.example.com')).toBe(true);
    expect(
      engine.checkRequest({
        url: 'https://googleads.g.doubleclick.net/pagead/id',
        resourceType: 'script',
        pageUrl: 'https://news.example.com/story',
      }).blocked,
    ).toBe(false);
    expect(
      engine.checkRequest({
        url: 'https://metrics-other.org/event',
        resourceType: 'ping',
        pageUrl: 'https://news.example.com/story',
      }).blocked,
    ).toBe(false);

    // Removing from whitelist re-enables blocking
    engine.removeWhitelistDomain('news.example.com');
    expect(
      engine.checkRequest({
        url: 'https://googleads.g.doubleclick.net/pagead/id',
        resourceType: 'script',
        pageUrl: 'https://news.example.com/story',
      }).blocked,
    ).toBe(true);
  });

  it('stops blocking when disabled and resets stats cleanly', () => {
    const engine = new BraveShieldEngine();
    expect(engine.checkUrl('https://doubleclick.net/pixel').blocked).toBe(true);
    expect(engine.getStats().totalBlocked).toBe(1);
    expect(engine.getStats().dataSavedKb).toBe(54);

    engine.setEnabled(false);
    expect(
      engine.checkRequest({
        url: 'https://google-analytics.com/g/collect',
        resourceType: 'xhr',
        pageUrl: 'https://example.com',
      }).blocked,
    ).toBe(false);
    expect(engine.getStats().totalBlocked).toBe(1);

    const cleared = engine.resetStats();
    expect(cleared).toEqual({
      totalBlocked: 0,
      adsBlocked: 0,
      trackersBlocked: 0,
      analyticsBlocked: 0,
      fingerprintersBlocked: 0,
      dataSavedKb: 0,
    });
  });

  it('youtubeAdController accelerates/mutes ads without writing currentTime and restores user state', () => {
    const controller = createAdController();
    let currentTimeWritten = false;
    const classes = new Set<string>(['ad-showing']);
    let skipped = false;
    const hiddenEl = { style: { display: 'block' } };

    const video = {
      playbackRate: 1.25,
      muted: false,
      set currentTime(_v: number) {
        currentTimeWritten = true;
      },
    };
    const player = {
      classList: {
        contains: (cls: string) => classes.has(cls),
      },
    };
    const dom = {
      querySelectorAll(sel: string) {
        if (sel.includes('ytp-skip-ad-button')) {
          return [{ click: () => { skipped = true; } }];
        }
        return [hiddenEl];
      },
    };

    controller.tick(player, video, dom);
    expect(currentTimeWritten).toBe(false);
    expect(skipped).toBe(true);
    expect(hiddenEl.style.display).toBe('none');
    expect(video.muted).toBe(true);
    expect(video.playbackRate).toBe(16);

    // Ad finishes
    classes.clear();
    controller.tick(player, video, dom);
    expect(currentTimeWritten).toBe(false);
    expect(video.muted).toBe(false);
    expect(video.playbackRate).toBe(1.25);
  });

  it('getCosmeticFilterCSS hides common ad containers without hiding player dialogs', () => {
    const css = new BraveShieldEngine().getCosmeticFilterCSS();
    expect(css).toContain('ins.adsbygoogle');
    expect(css).toContain('#masthead-ad');
    expect(css).toContain('ytd-ad-slot-renderer');
    expect(css).not.toContain('tp-yt-paper-dialog');
  });

  it('normalizes and deduplicates shieldWhitelist in settings', () => {
    const normalized = normalizeSettings({
      adblockEnabled: true,
      shieldWhitelist: ['https://WWW.Example.com/page', 'example.org.', '', 'www.example.com'],
    });
    expect(normalized.shieldWhitelist).toEqual(['example.org', 'www.example.com']);
  });
});

