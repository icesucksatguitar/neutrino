import { app, Session } from 'electron';
import { buildUserAgent } from './userAgent';

// Captured at module load, before src/main/index.ts overrides app.userAgentFallback, so the OS
// token comes from Electron's real default UA.
const electronDefaultUserAgent = app.userAgentFallback;

let browserUserAgent: string | null = null;

/** The single user-agent every Neutrino session, tab, popup and drawer uses. */
export function getBrowserUserAgent(): string {
  if (!browserUserAgent) {
    browserUserAgent = buildUserAgent(
      electronDefaultUserAgent,
      'Neutrino',
      app.getVersion(),
      process.versions.chrome,
      process.platform
    );
  }
  return browserUserAgent;
}

/**
 * Applies the browser identity to a session once, before any page in it loads. Client hints are
 * deliberately left to Chromium so Sec-CH-UA* stays consistent with navigator.userAgentData.
 */
export function applyBrowserIdentity(sess: Session): void {
  sess.setUserAgent(getBrowserUserAgent());
}
