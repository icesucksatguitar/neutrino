/**
 * OS authenticator bridge (R10.1, R10.5, R10.6).
 *
 * Reveal/copy of a saved password requires re-authentication with the OS
 * when available. On Windows this spawns the native helper:
 *
 *   neutrino-core.exe verify --hwnd <n> --reason <text>
 *
 * which shows the Windows Hello / Windows sign-in prompt parented to the
 * main window and prints one JSON line on stdout:
 *
 *   {"result":"verified"|"cancelled"|"failed"|"unavailable","message":...}
 *
 * Mapping:
 * - helper binary missing, spawn ENOENT, non-Windows, no window handle,
 *   or Hello not set up -> `unavailable` (caller falls back to a
 *   confirmation dialog, R10.5).
 * - user cancelled -> `cancelled`; anything else that is not `verified`
 *   (bad output, crash, timeout) -> `failed`. Both withhold the secret (R10.6).
 *
 * Arguments go to `execFile` as an array with no shell, so `reason` cannot
 * inject commands. No Electron imports: the window-handle getter, path
 * inputs, `execFile` and `existsSync` are injected for unit tests.
 */
import { execFile as nodeExecFile } from 'node:child_process';
import { existsSync as nodeExistsSync } from 'node:fs';
import * as path from 'node:path';

export type OSAuthResult = 'verified' | 'cancelled' | 'failed' | 'unavailable';

export interface OSAuthOutcome {
  result: OSAuthResult;
  message?: string;
}

/** Subset of `child_process.execFile` used here (callback form). */
export type ExecFileFn = (
  file: string,
  args: readonly string[],
  options: { windowsHide: boolean; timeout: number; shell: false },
  callback: (error: (Error & { code?: unknown }) | null, stdout: string, stderr: string) => void,
) => unknown;

export interface OSAuthDeps {
  /** `app.isPackaged`. */
  isPackaged: boolean;
  /** `process.resourcesPath` (used when packaged). */
  resourcesPath: string;
  /** Repo/app root in development (`app.getAppPath()`). */
  appRoot: string;
  /** Returns `mainWindow.getNativeWindowHandle()`, or null if no window. */
  getWindowHandle: () => Buffer | null | undefined;
  execFile?: ExecFileFn;
  existsSync?: (p: string) => boolean;
  platform?: NodeJS.Platform;
  /** Max time the prompt may stay open before it counts as failed. */
  timeoutMs?: number;
}

export interface OSAuthenticator {
  verify(reason: string): Promise<OSAuthOutcome>;
}

export const HELPER_BINARY = 'neutrino-core.exe';
export const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
export const MAX_REASON_LENGTH = 200;
export const DEFAULT_REASON = 'Verify your identity';

/** Resolve the helper path: `resources/bin` when packaged, `native/target/release` in dev. */
export function resolveHelperPath(deps: Pick<OSAuthDeps, 'isPackaged' | 'resourcesPath' | 'appRoot'>): string {
  return deps.isPackaged
    ? path.join(deps.resourcesPath, 'bin', HELPER_BINARY)
    : path.join(deps.appRoot, 'native', 'target', 'release', HELPER_BINARY);
}

/**
 * Read an HWND from `getNativeWindowHandle()`'s buffer as a little-endian
 * pointer-sized signed integer (matches the helper's `isize` parse).
 * Returns null for an empty/odd-sized buffer.
 */
export function readHwnd(buf: Buffer | null | undefined): string | null {
  if (!buf) return null;
  if (buf.length >= 8) return buf.readBigInt64LE(0).toString();
  if (buf.length >= 4) return buf.readInt32LE(0).toString();
  return null;
}

/** Strip control characters (NUL breaks execFile), collapse whitespace, cap length. */
export function sanitizeReason(reason: unknown): string {
  const text = typeof reason === 'string' ? reason : '';
  // eslint-disable-next-line no-control-regex
  const cleaned = text.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  const capped = cleaned.slice(0, MAX_REASON_LENGTH);
  return capped.length > 0 ? capped : DEFAULT_REASON;
}

const RESULTS: ReadonlySet<string> = new Set(['verified', 'cancelled', 'failed', 'unavailable']);

/** Parse the helper's stdout. Unrecognised output counts as `failed`. */
export function parseHelperOutput(stdout: string): OSAuthOutcome {
  const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const obj = JSON.parse(lines[i]) as { result?: unknown; message?: unknown };
      if (obj && typeof obj.result === 'string' && RESULTS.has(obj.result)) {
        const outcome: OSAuthOutcome = { result: obj.result as OSAuthResult };
        if (typeof obj.message === 'string') outcome.message = obj.message;
        return outcome;
      }
    } catch {
      // not JSON; keep scanning
    }
  }
  return { result: 'failed', message: 'unrecognised helper output' };
}

export function createOSAuthenticator(deps: OSAuthDeps): OSAuthenticator {
  const execFile: ExecFileFn = deps.execFile ?? (nodeExecFile as unknown as ExecFileFn);
  const existsSync = deps.existsSync ?? nodeExistsSync;
  const platform = deps.platform ?? process.platform;
  const timeout = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    verify(reason: string): Promise<OSAuthOutcome> {
      if (platform !== 'win32') {
        return Promise.resolve({ result: 'unavailable', message: 'OS authentication is only supported on Windows' });
      }
      const helper = resolveHelperPath(deps);
      if (!existsSync(helper)) {
        return Promise.resolve({ result: 'unavailable', message: 'native helper not found' });
      }
      let hwnd: string | null;
      try {
        hwnd = readHwnd(deps.getWindowHandle());
      } catch {
        hwnd = null;
      }
      if (hwnd === null || hwnd === '0') {
        return Promise.resolve({ result: 'unavailable', message: 'no window handle' });
      }
      const args = ['verify', '--hwnd', hwnd, '--reason', sanitizeReason(reason)];

      return new Promise<OSAuthOutcome>((resolve) => {
        try {
          execFile(helper, args, { windowsHide: true, timeout, shell: false }, (error, stdout) => {
            if (error && (error.code === 'ENOENT' || error.code === 'EACCES')) {
              resolve({ result: 'unavailable', message: 'native helper could not be started' });
              return;
            }
            const parsed = parseHelperOutput(typeof stdout === 'string' ? stdout : String(stdout ?? ''));
            if (error && parsed.message === 'unrecognised helper output') {
              resolve({ result: 'failed', message: 'native helper error' });
              return;
            }
            resolve(parsed);
          });
        } catch {
          resolve({ result: 'unavailable', message: 'native helper could not be started' });
        }
      });
    },
  };
}
