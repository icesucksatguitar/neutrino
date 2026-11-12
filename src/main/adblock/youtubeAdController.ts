export interface AdPlayerLike {
  classList: { contains(token: string): boolean };
}

export interface AdVideoLike {
  playbackRate: number;
  muted: boolean;
}

export interface AdControllerDom {
  querySelectorAll?(selector: string): ArrayLike<{ click?: () => void; style?: { display: string } }>;
}

export interface SavedPlaybackState {
  rate: number;
  muted: boolean;
}

export const AD_SKIP_BUTTON_SELECTORS =
  '.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, button.ytp-ad-skip-button, .ytp-ad-overlay-close-button';

export const AD_OVERLAY_SELECTORS =
  '.ytp-ad-overlay-container, ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, #player-ads, #masthead-ad, ytd-companion-slot-renderer';

/**
 * Stateful YouTube ad handler that mutes/accelerates active video ads and clicks
 * skip buttons without ever mutating `video.currentTime`, then restores the
 * user's playback rate and mute state as soon as the ad finishes.
 */
export function createAdController() {
  let saved: SavedPlaybackState | null = null;

  return {
    tick(player: AdPlayerLike | null, video: AdVideoLike | null, dom?: AdControllerDom) {
      const inAd =
        Boolean(player) &&
        (player!.classList.contains('ad-showing') || player!.classList.contains('ad-interrupting'));

      if (inAd) {
        if (video) {
          if (!saved) {
            saved = { rate: video.playbackRate, muted: video.muted };
          }
          video.muted = true;
          video.playbackRate = 16;
        }
      } else if (saved) {
        if (video) {
          video.playbackRate = saved.rate;
          video.muted = saved.muted;
        }
        saved = null;
      }

      if (dom?.querySelectorAll) {
        try {
          const skipButtons = dom.querySelectorAll(AD_SKIP_BUTTON_SELECTORS);
          for (let i = 0; i < skipButtons.length; i++) {
            const btn = skipButtons[i];
            if (btn && typeof btn.click === 'function') {
              btn.click();
            }
          }

          const overlays = dom.querySelectorAll(AD_OVERLAY_SELECTORS);
          for (let i = 0; i < overlays.length; i++) {
            const el = overlays[i];
            if (el && el.style) {
              el.style.display = 'none';
            }
          }
        } catch {
          // Ignore transient DOM exceptions inside third-party frames
        }
      }
    },
    reset() {
      saved = null;
    },
  };
}

