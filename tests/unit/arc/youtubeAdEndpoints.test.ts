import { describe, it, expect } from 'vitest';
import { SessionConfigurator, type TrackerBlockedPayload } from '../../../src/main/sessions/configurator';
import { BraveShieldEngine } from '../../../src/main/adblock/engine';
import { isMediaStreamingUrl } from '../../../src/main/urlClassifier';

function setup() {
  const reported: TrackerBlockedPayload[] = [];
  const configurator = new SessionConfigurator({
    adblockEngine: new BraveShieldEngine(),
    applyIdentity: () => {},
    shouldBlockForKillSwitch: () => false,
    isMediaStreamingUrl,
    reportBlocked: (p) => reported.push(p),
  });
  return { configurator, reported };
}

describe('YouTube ad endpoints in the live request path (bugfix 3.3)', () => {
  it('cancels youtubei/v1/player/ad_break and reports it as an ad endpoint', () => {
    const { configurator, reported } = setup();
    const url = 'https://www.youtube.com/youtubei/v1/player/ad_break?key=cs4';
    expect(isMediaStreamingUrl(url)).toBe(false);
    expect(configurator.decideRequest(url)).toEqual({ cancel: true });
    expect(reported).toEqual([
      { url, domain: 'www.youtube.com', category: 'Advertising', rule: 'Pattern: ad-endpoint' },
    ]);
  });

  it('cancels qoe?adformat= ad telemetry', () => {
    const { configurator, reported } = setup();
    expect(configurator.decideRequest('https://www.youtube.com/api/stats/qoe?adformat=15_2_1&cpn=x')).toEqual({ cancel: true });
    expect(reported).toHaveLength(1);
  });

  it('keeps playback-critical requests allowed and unreported', () => {
    const { configurator, reported } = setup();
    for (const url of [
      'https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_',
      'https://rr2---sn-4g5ednss.googlevideo.com/videoplayback?expire=1&itag=18',
      'https://www.youtube.com/api/stats/playback?docid=dQw4w9WgXcQ',
      'https://www.youtube.com/api/stats/watchtime?docid=dQw4w9WgXcQ',
      'https://www.youtube.com/api/stats/qoe?cpn=x',
      'https://www.youtube.com/ptracking?ei=x',
    ]) {
      expect(isMediaStreamingUrl(url)).toBe(true);
      expect(configurator.decideRequest(url)).toEqual({ cancel: false });
    }
    expect(reported).toEqual([]);
  });
});
