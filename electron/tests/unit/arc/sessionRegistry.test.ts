import { describe, it, expect } from 'vitest';
import { SessionConfigurator } from '../../../src/main/sessions/configurator';
import { SessionRegistry } from '../../../src/main/sessions/registry';

/** Stands in for an Electron Session and counts what `configure` registers on it. */
function createFakeSession(partition: string) {
  const counts = { identity: 0, beforeRequest: 0, checkHandler: 0, requestHandler: 0 };
  const sess = {
    partition,
    counts,
    setUserAgent: (_ua: string) => {},
    webRequest: {
      onBeforeRequest: (_filter: unknown, _listener: unknown) => {
        counts.beforeRequest++;
      },
    },
    setPermissionCheckHandler: (_h: unknown) => {
      counts.checkHandler++;
    },
    setPermissionRequestHandler: (_h: unknown) => {
      counts.requestHandler++;
    },
  };
  return sess;
}
type FakeSession = ReturnType<typeof createFakeSession>;

function setup(opts: {
  onRegistered?: (partition: string) => void | Promise<void>;
  onError?: (error: unknown, partition: string) => void;
} = {}) {
  const created = new Map<string, FakeSession>();
  const fromPartitionCalls: string[] = [];
  // Mirrors session.fromPartition: the same partition always yields the same session object.
  const fromPartition = (partition: string): FakeSession => {
    fromPartitionCalls.push(partition);
    let sess = created.get(partition);
    if (!sess) {
      sess = createFakeSession(partition);
      created.set(partition, sess);
    }
    return sess;
  };
  const configurator = new SessionConfigurator({
    adblockEngine: { checkUrl: () => ({ blocked: false, domain: '' }) as any },
    applyIdentity: (sess) => {
      (sess as unknown as FakeSession).counts.identity++;
    },
    shouldBlockForKillSwitch: () => false,
    isMediaStreamingUrl: () => false,
    reportBlocked: () => {},
  });
  const registry = new SessionRegistry<FakeSession>({
    configurator,
    fromPartition,
    onRegistered: opts.onRegistered,
    onError: opts.onError,
  });
  return { registry, configurator, created, fromPartitionCalls };
}

describe('SessionRegistry', () => {
  it('ensure configures the session before returning it', () => {
    const { registry, configurator } = setup();
    const sess = registry.ensure('persist:profile-a');
    expect(sess.partition).toBe('persist:profile-a');
    expect(configurator.isConfigured(sess)).toBe(true);
    expect(sess.counts).toEqual({ identity: 1, beforeRequest: 1, checkHandler: 1, requestHandler: 1 });
  });

  it('ensure is idempotent: repeated calls return the same session configured once', () => {
    const { registry, fromPartitionCalls } = setup();
    const first = registry.ensure('persist:profile-a');
    const second = registry.ensure('persist:profile-a');
    const third = registry.ensure('persist:profile-a');
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(first.counts).toEqual({ identity: 1, beforeRequest: 1, checkHandler: 1, requestHandler: 1 });
    expect(fromPartitionCalls).toEqual(['persist:profile-a']);
  });

  it('rejects an empty or non-string partition', () => {
    const { registry } = setup();
    expect(() => registry.ensure('')).toThrow(TypeError);
    expect(() => registry.ensure(undefined as unknown as string)).toThrow(TypeError);
    expect(registry.partitions()).toEqual([]);
  });

  it('partitions() is the live registered set in registration order', () => {
    const { registry } = setup();
    expect(registry.partitions()).toEqual([]);
    registry.ensure('persist:neutrino');
    const snapshot = registry.partitions();
    registry.ensure('persist:profile-b');
    registry.ensure('persist:neutrino');
    expect(registry.partitions()).toEqual(['persist:neutrino', 'persist:profile-b']);
    // Returned arrays are copies; mutating one does not change the registry.
    snapshot.push('persist:bogus');
    expect(registry.partitions()).toEqual(['persist:neutrino', 'persist:profile-b']);
    expect(registry.has('persist:profile-b')).toBe(true);
    expect(registry.has('persist:bogus')).toBe(false);
  });

  it('applyToAll reaches every registered session exactly once', () => {
    const { registry } = setup();
    const a = registry.ensure('persist:a');
    const b = registry.ensure('persist:b');
    const seen: Array<[FakeSession, string]> = [];
    registry.applyToAll((sess, partition) => seen.push([sess, partition]));
    expect(seen).toEqual([
      [a, 'persist:a'],
      [b, 'persist:b'],
    ]);
  });

  it('applyToAll keeps going when one session throws, and reports the error', () => {
    const errors: Array<[unknown, string]> = [];
    const { registry } = setup({ onError: (e, p) => errors.push([e, p]) });
    registry.ensure('persist:a');
    registry.ensure('persist:b');
    const reached: string[] = [];
    registry.applyToAll((_sess, partition) => {
      reached.push(partition);
      if (partition === 'persist:a') throw new Error('boom');
    });
    expect(reached).toEqual(['persist:a', 'persist:b']);
    expect(errors.map(([, p]) => p)).toEqual(['persist:a']);
  });

  it('onRegistered fires once per new partition, after configuration', () => {
    const calls: Array<[string, boolean]> = [];
    let ctx!: ReturnType<typeof setup>;
    ctx = setup({
      onRegistered: (partition) => {
        const sess = ctx.created.get(partition)!;
        calls.push([partition, ctx.configurator.isConfigured(sess) && ctx.registry.has(partition)]);
      },
    });
    ctx.registry.ensure('persist:a');
    ctx.registry.ensure('persist:a');
    ctx.registry.ensure('persist:b');
    expect(calls).toEqual([
      ['persist:a', true],
      ['persist:b', true],
    ]);
  });

  it('a throwing or rejecting onRegistered does not break ensure', async () => {
    const errors: string[] = [];
    const { registry } = setup({
      onRegistered: (partition) =>
        partition === 'persist:sync' ? (() => { throw new Error('sync'); })() : Promise.reject(new Error('async')),
      onError: (e) => errors.push((e as Error).message),
    });
    expect(() => registry.ensure('persist:sync')).not.toThrow();
    expect(() => registry.ensure('persist:async')).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(errors.sort()).toEqual(['async', 'sync']);
    expect(registry.partitions()).toEqual(['persist:sync', 'persist:async']);
  });
});
