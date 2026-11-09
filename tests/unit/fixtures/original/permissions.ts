// Verbatim copy of the UNFIXED permission handlers from setupNetworkInterception
// in src/main/index.ts. Wrapped in a factory with the same signature as the fixed
// `createPermissionHandlers(store, promptFn)` so the bug-condition test can be pointed
// at src/main/permissions.ts in task 3.16. The original ignores both arguments.

// Sensitive permission list from design.md (Fix Implementation, src/main/permissions.ts).
export const SENSITIVE_PERMISSIONS = [
  'media',
  'geolocation',
  'notifications',
  'clipboard-read',
  'display-capture',
  'midi',
  'midiSysex',
  'idle-detection',
  'window-management',
  'openExternal',
  'storage-access',
  'top-level-storage-access',
  'keyboardLock',
] as const;

export const SAFE_PERMISSIONS = ['fullscreen', 'pointerLock', 'clipboard-sanitized-write', 'mediaKeySystem'] as const;

export function createOriginalPermissionHandlers(_store?: unknown, _promptFn?: unknown) {
  // sess.setPermissionCheckHandler(() => true);
  const checkHandler = (..._args: any[]) => true;
  // sess.setPermissionRequestHandler((webContents, permission, callback) => { callback(true); });
  const requestHandler = (webContents: any, permission: any, callback: any, ..._rest: any[]) => {
    callback(true);
  };
  return { checkHandler, requestHandler };
}
