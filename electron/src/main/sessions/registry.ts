import type { Session } from 'electron';
import type { ConfigurableSession } from './configurator';

/**
 * Owns every Profile_Session the browser has touched (requirements 2.1, 2.8).
 *
 * `ensure(partition)` resolves the session for a partition and configures it (adblock request
 * interception, identity/UA, permission handlers) before returning, so a caller that creates a
 * Web_Content right after `ensure` never loads in an unconfigured session. `partitions()` is the
 * live set the VPN controller reads, and `applyToAll` propagates shields/identity/UA changes to
 * every registered session.
 *
 * This module imports Electron only for types. `fromPartition` is injected (in the app:
 * `session.fromPartition`), so tests drive the registry with fake sessions.
 */

/** The slice of SessionConfigurator the registry uses. */
export interface SessionConfiguratorLike<S> {
  configure(sess: S): void;
}

export interface SessionRegistryDeps<S extends ConfigurableSession = Session> {
  configurator: SessionConfiguratorLike<S>;
  /** Resolves the session for a partition. In the app: `session.fromPartition`. */
  fromPartition: (partition: string) => S;
  /**
   * Called once per partition, after it is configured and registered. In the app this brings a
   * newly registered session in line with the current VPN state
   * (`vpnController.applyToPartition(partition)`). A returned promise is not awaited; a rejection
   * or a thrown error is passed to `onError` and never breaks `ensure`.
   */
  onRegistered?: (partition: string) => void | Promise<void>;
  /** Receives errors from `onRegistered` and `applyToAll` callbacks. Defaults to console.error. */
  onError?: (error: unknown, partition: string) => void;
}

export class SessionRegistry<S extends ConfigurableSession = Session> {
  private readonly sessions = new Map<string, S>();

  constructor(private readonly deps: SessionRegistryDeps<S>) {}

  /**
   * Returns the configured session for `partition`. Idempotent: the session is resolved and
   * configured on the first call only; later calls return the same session without reconfiguring.
   */
  ensure(partition: string): S {
    if (typeof partition !== 'string' || partition.length === 0) {
      throw new TypeError('SessionRegistry.ensure: partition must be a non-empty string');
    }
    const existing = this.sessions.get(partition);
    if (existing) return existing;

    const sess = this.deps.fromPartition(partition);
    // Configure before registering, so a failing configure leaves no half-registered entry.
    this.deps.configurator.configure(sess);
    this.sessions.set(partition, sess);

    const onRegistered = this.deps.onRegistered;
    if (onRegistered) {
      try {
        const result = onRegistered(partition);
        if (result && typeof (result as Promise<void>).then === 'function') {
          (result as Promise<void>).catch((error) => this.reportError(error, partition));
        }
      } catch (error) {
        this.reportError(error, partition);
      }
    }
    return sess;
  }

  /** True when `partition` has been registered through `ensure`. */
  has(partition: string): boolean {
    return this.sessions.has(partition);
  }

  /** The registered partitions, in registration order. A fresh array on every call. */
  partitions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Runs `fn` once for every registered session. An error from one session is reported and does
   * not stop the others.
   */
  applyToAll(fn: (sess: S, partition: string) => void): void {
    for (const [partition, sess] of Array.from(this.sessions.entries())) {
      try {
        fn(sess, partition);
      } catch (error) {
        this.reportError(error, partition);
      }
    }
  }

  private reportError(error: unknown, partition: string): void {
    if (this.deps.onError) {
      this.deps.onError(error, partition);
    } else {
      console.error(`[SessionRegistry] ${partition}:`, error);
    }
  }
}
