// Verbatim copy of the UNFIXED YouTube ad skipper logic.
// Source: BraveShieldEngine.getYouTubeAdSkipperScript() in src/main/adblock/engine.ts
// (the inline copy in BrowserViewport.injectAdblocking has the same body).
// The only change is that `document` is passed in so the logic can run against a
// fake DOM in node. Do not edit the body.

export interface SkipperDocument {
  querySelector(selector: string): any;
  querySelectorAll(selector: string): ArrayLike<any> & { forEach(cb: (el: any) => void): void };
}

export function createOriginalSkipAds(document: SkipperDocument): () => void {
  const skipAds = () => {
    try {
      // 1. Fast-forward video ad if currently playing
      const video = document.querySelector('video');
      const adShowing = document.querySelector('.ad-showing, .ad-interrupting');
      if (adShowing && video && !isNaN(video.duration) && isFinite(video.duration)) {
        video.currentTime = video.duration;
        video.playbackRate = 16.0;
      }

      // 2. Click any skip button that appears
      const skipButtons = document.querySelectorAll(
        '.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, button.ytp-ad-skip-button, .ytp-ad-overlay-close-button'
      );
      skipButtons.forEach((btn) => (btn as HTMLElement).click());

      // 3. Dismiss ad overlay banners
      const overlays = document.querySelectorAll('.ytp-ad-overlay-container, ytd-ad-slot-renderer, #player-ads');
      overlays.forEach((el) => { (el as HTMLElement).style.display = 'none'; });
    } catch (e) {}
  };
  return skipAds;
}
