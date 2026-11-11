import { describe, it, expect } from 'vitest';
import path from 'path';
import {
  createOSAuthenticator,
  parseHelperOutput,
  readHwnd,
  resolveHelperPath,
  sanitizeReason,
  DEFAULT_REASON,
  MAX_REASON_LENGTH,
  type ExecFileFn,
  type OSAuthDeps,
} from '../../../src/main/passwords/osAuth';

interface Call {
  file: string;
  args: readonly string[];
  options: { windowsHide: boolean; timeout: number; shell: false };
}

function hwndBuffer(value: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(value);
  return b;
}

function makeDeps(
  respond: (call: Call) => { error?: (Error & { code?: unknown }) | null; stdout?: string },
  overrides: Partial<OSAuthDeps> = {},
): { deps: OSAuthDeps; calls: Call[] } {
  const calls: Call[] = [];
  const execFile: ExecFileFn = (file, args, options, cb) => {
    const call = { file, args, options };
    calls.push(call);
    const r = respond(call);
    setImmediate(() => cb(r.error ?? null, r.stdout ?? '', ''));
  };
  return {
    calls,
    deps: {
      isPackaged: true,
      resourcesPath: 'C:\\App\\resources',
      appRoot: 'C:\\repo',
      getWindowHandle: () => hwndBuffer(0x1a2b3cn),
      execFile,
      existsSync: () => true,
      platform: 'win32',
      ...overrides,
    },
  };
}

describe('resolveHelperPath', () => {
  it('uses resources/bin when packaged', () => {
    expect(resolveHelperPath({ isPackaged: true, resourcesPath: 'R', appRoot: 'A' })).toBe(
      path.join('R', 'bin', 'neutrino-core.exe'),
    );
  });
  it('uses native/target/release in development', () => {
    expect(resolveHelperPath({ isPackaged: false, resourcesPath: 'R', appRoot: 'A' })).toBe(
      path.join('A', 'native', 'target', 'release', 'neutrino-core.exe'),
    );
  });
});

describe('readHwnd', () => {
  it('reads an 8-byte little-endian handle', () => {
    expect(readHwnd(hwndBuffer(0x1a2b3cn))).toBe(String(0x1a2b3c));
  });
  it('reads a 4-byte handle', () => {
    const b = Buffer.alloc(4);
    b.writeInt32LE(4242);
    expect(readHwnd(b)).toBe('4242');
  });
  it('returns null for missing or short buffers', () => {
    expect(readHwnd(null)).toBeNull();
    expect(readHwnd(Buffer.alloc(2))).toBeNull();
  });
});

describe('sanitizeReason', () => {
  it('strips control characters and caps length', () => {
    expect(sanitizeReason('a\u0000b\nc')).toBe('a b c');
    expect(sanitizeReason('x'.repeat(500))).toHaveLength(MAX_REASON_LENGTH);
  });
  it('falls back to a default for empty input', () => {
    expect(sanitizeReason('  ')).toBe(DEFAULT_REASON);
    expect(sanitizeReason(undefined)).toBe(DEFAULT_REASON);
  });
});

describe('parseHelperOutput', () => {
  it('maps each helper result', () => {
    for (const r of ['verified', 'cancelled', 'failed', 'unavailable'] as const) {
      expect(parseHelperOutput(JSON.stringify({ result: r, message: null })).result).toBe(r);
    }
  });
  it('keeps the message and tolerates trailing newlines', () => {
    expect(parseHelperOutput('{"result":"unavailable","message":"no hello"}\r\n')).toEqual({
      result: 'unavailable',
      message: 'no hello',
    });
  });
  it('treats garbage or unknown results as failed', () => {
    expect(parseHelperOutput('').result).toBe('failed');
    expect(parseHelperOutput('not json').result).toBe('failed');
    expect(parseHelperOutput('{"result":"ok"}').result).toBe('failed');
  });
});

describe('OSAuthenticator.verify', () => {
  it('spawns the helper with an argument array, the HWND and no shell', async () => {
    const { deps, calls } = makeDeps(() => ({ stdout: '{"result":"verified","message":null}\n' }));
    const reason = 'Show password"; & calc.exe';
    const out = await createOSAuthenticator(deps).verify(reason);
    expect(out.result).toBe('verified');
    expect(calls).toHaveLength(1);
    expect(calls[0].file).toBe(path.join('C:\\App\\resources', 'bin', 'neutrino-core.exe'));
    expect(calls[0].args).toEqual(['verify', '--hwnd', String(0x1a2b3c), '--reason', reason]);
    expect(calls[0].options.shell).toBe(false);
    expect(calls[0].options.windowsHide).toBe(true);
  });

  it('passes through cancelled and failed', async () => {
    for (const r of ['cancelled', 'failed'] as const) {
      const { deps } = makeDeps(() => ({ stdout: JSON.stringify({ result: r, message: null }) }));
      expect((await createOSAuthenticator(deps).verify('x')).result).toBe(r);
    }
  });

  it('reports unavailable when Hello is missing', async () => {
    const { deps } = makeDeps(() => ({ stdout: '{"result":"unavailable","message":"Windows Hello is not available"}' }));
    expect((await createOSAuthenticator(deps).verify('x')).result).toBe('unavailable');
  });

  it('reports unavailable without spawning when the helper binary is missing', async () => {
    const { deps, calls } = makeDeps(() => ({ stdout: '' }), { existsSync: () => false });
    expect((await createOSAuthenticator(deps).verify('x')).result).toBe('unavailable');
    expect(calls).toHaveLength(0);
  });

  it('reports unavailable when spawning fails with ENOENT', async () => {
    const err = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });
    const { deps } = makeDeps(() => ({ error: err }));
    expect((await createOSAuthenticator(deps).verify('x')).result).toBe('unavailable');
  });

  it('reports unavailable off Windows or without a window handle', async () => {
    const a = makeDeps(() => ({ stdout: '{"result":"verified"}' }), { platform: 'linux' });
    expect((await createOSAuthenticator(a.deps).verify('x')).result).toBe('unavailable');
    expect(a.calls).toHaveLength(0);
    const b = makeDeps(() => ({ stdout: '{"result":"verified"}' }), { getWindowHandle: () => null });
    expect((await createOSAuthenticator(b.deps).verify('x')).result).toBe('unavailable');
    expect(b.calls).toHaveLength(0);
  });

  it('treats a crash or timeout with no result as failed', async () => {
    const err = Object.assign(new Error('killed'), { code: null });
    const { deps } = makeDeps(() => ({ error: err, stdout: '' }));
    expect((await createOSAuthenticator(deps).verify('x')).result).toBe('failed');
  });

  it('uses the dev path when not packaged', async () => {
    const { deps, calls } = makeDeps(() => ({ stdout: '{"result":"verified"}' }), { isPackaged: false });
    await createOSAuthenticator(deps).verify('x');
    expect(calls[0].file).toBe(path.join('C:\\repo', 'native', 'target', 'release', 'neutrino-core.exe'));
  });
});
