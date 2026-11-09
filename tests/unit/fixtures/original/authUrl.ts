// Verbatim copy of the UNFIXED `isGoogleAuthUrl` and `isAuthOrSecurityUrl` from
// src/main/index.ts, taken before any task-3 source change. Do not edit to follow the fix.

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
