// Pure user-agent construction. No Electron import, so unit tests can use it directly.
//
// Neutrino reports what it actually is: the real operating system (taken from Electron's own
// default UA), the Chromium version that is really bundled, and a Neutrino product token. It does
// not claim to be Google Chrome and it does not add or rewrite client hints: Chromium generates
// Sec-CH-UA* and navigator.userAgentData from its own brand list, which then agree with this UA.

/** OS tokens Chromium uses when the default UA cannot be parsed (frozen per UA reduction). */
const FALLBACK_OS_TOKENS: Record<string, string> = {
  win32: 'Windows NT 10.0; Win64; x64',
  darwin: 'Macintosh; Intel Mac OS X 10_15_7',
  linux: 'X11; Linux x86_64',
};

/**
 * Builds the browser user-agent.
 *
 * @param defaultUA      Electron's default UA (app.userAgentFallback before any override)
 * @param productName    the browser's product token, "Neutrino"
 * @param productVersion the app version (app.getVersion())
 * @param chromeVersion  the bundled Chromium version (process.versions.chrome)
 * @param platform       process.platform, used only when defaultUA has no OS token
 */
export function buildUserAgent(
  defaultUA: string,
  productName: string,
  productVersion: string,
  chromeVersion: string,
  platform: string
): string {
  const match = /\(([^)]+)\)/.exec(defaultUA || '');
  const osToken = match?.[1]?.trim() || FALLBACK_OS_TOKENS[platform] || FALLBACK_OS_TOKENS.linux;
  return `Mozilla/5.0 (${osToken}) AppleWebKit/537.36 (KHTML, like Gecko) ${productName}/${productVersion} Chrome/${chromeVersion} Safari/537.36`;
}
