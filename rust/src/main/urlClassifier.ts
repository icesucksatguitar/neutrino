// Pure URL classification shared by the main process. No Electron import, so tests and
// other pure modules (darkMode.ts) can use it directly. Moved verbatim from src/main/index.ts.

export function isGoogleAuthUrl(url: string): boolean {
  if (!url) return false;
  return (
    url.includes('accounts.google.com') ||
    url.includes('myaccount.google.com') ||
    url.includes('accounts.youtube.com') ||
    url.includes('oauth2.googleapis.com') ||
    url.includes('apis.google.com/oauth')
  );
}

export function isAuthOrSecurityUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    isGoogleAuthUrl(url) ||
    lower.includes('recaptcha') ||
    lower.includes('gstatic.com') ||
    lower.includes('turnstile') ||
    lower.includes('challenges.cloudflare.com') ||
    lower.includes('hcaptcha') ||
    lower.includes('appleid.apple.com') ||
    lower.includes('github.com/login') ||
    lower.includes('api.github.com') ||
    lower.includes('login.microsoftonline.com') ||
    lower.includes('login.live.com') ||
    lower.includes('msftauth.net') ||
    lower.includes('identitytoolkit.googleapis.com') ||
    lower.includes('securetoken.googleapis.com') ||
    lower.includes('auth0.com') ||
    lower.includes('clerk.') ||
    lower.includes('supabase.co') ||
    lower.includes('penpencil.co') ||
    lower.includes('pw.live') ||
    lower.includes('/oauth') ||
    lower.includes('/auth') ||
    lower.includes('/signin') ||
    lower.includes('/signup') ||
    lower.includes('/login') ||
    lower.includes('/otp') ||
    lower.includes('/token')
  );
}

/**
 * YouTube ad endpoints that share a prefix with playback endpoints (`youtubei/v1/player/ad_break`,
 * `api/stats/qoe?adformat=`). The original shield engine blocked these as `Pattern: ad-endpoint`,
 * so the playback allowlists below must not let them through (bugfix 3.3).
 */
export function isYoutubeAdEndpointUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes('youtubei/v1/player/ad_break') || lower.includes('youtube.com/api/stats/qoe?adformat=');
}

/** YouTube video streams and playback feeds that are never blocked. Moved from src/main/index.ts. */
export function isMediaStreamingUrl(url: string): boolean {
  if (!url) return false;
  if (isYoutubeAdEndpointUrl(url)) return false;
  const lower = url.toLowerCase();
  return (
    lower.includes('googlevideo.com') ||
    lower.includes('videoplayback') ||
    lower.includes('youtubei/v1/player') ||
    lower.includes('youtube.com/api/stats/playback') ||
    lower.includes('youtube.com/api/stats/watchtime') ||
    lower.includes('youtube.com/api/stats/delayplay') ||
    lower.includes('youtube.com/api/stats/atr') ||
    lower.includes('youtube.com/api/stats/qoe') ||
    lower.includes('youtube.com/ptracking')
  );
}
