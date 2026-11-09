// Verbatim copy of the UNFIXED handleFailLoad from BrowserViewport.attachWebviewEvents.
// The `isDev` argument mirrors the fixed renderer's `import.meta.env.DEV` gate; the
// original ignores it and always logs. Do not edit the body.

export function createOriginalHandleFailLoad(_isDev: boolean) {
  const handleFailLoad = (e: any) => {
    if (e.errorCode !== -3) {
      console.warn('Webview failed to load:', e.validatedURL, e.errorDescription);
    }
  };
  return handleFailLoad;
}
