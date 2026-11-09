// Verbatim copy of the UNFIXED browser identity from src/main/index.ts
// (and the identical DESKTOP_USER_AGENT in src/renderer/components/BrowserViewport.tsx
// and the inline literal in src/renderer/components/McpModal.tsx).
// Do not edit: tests compare against this snapshot of the original behavior.

export const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// The unfixed onBeforeSendHeaders rewrite in setupNetworkInterception.
export function originalRewriteHeaders(requestHeaders: Record<string, string>): Record<string, string> {
  const headers = { ...requestHeaders };

  headers['User-Agent'] = CHROME_USER_AGENT;
  headers['Sec-CH-UA'] = '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"';
  headers['sec-ch-ua'] = '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"';
  headers['Sec-CH-UA-Mobile'] = '?0';
  headers['sec-ch-ua-mobile'] = '?0';
  headers['Sec-CH-UA-Platform'] = '"Windows"';
  headers['sec-ch-ua-platform'] = '"Windows"';

  return headers;
}

/**
 * The user-agent the unfixed app sends, expressed with the same signature as the
 * fixed `buildUserAgent(defaultUA, productName, productVersion, chromeVersion, platform)`
 * so the bug-condition test can be pointed at the fixed module in task 3.16.
 * The unfixed app ignores every input and always sends CHROME_USER_AGENT.
 */
export function originalBuildUserAgent(
  _defaultUA: string,
  _productName: string,
  _productVersion: string,
  _chromeVersion: string,
  _platform: string
): string {
  return CHROME_USER_AGENT;
}
