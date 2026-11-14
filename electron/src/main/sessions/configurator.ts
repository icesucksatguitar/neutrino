import type { Session, WebContents } from 'electron';
import type { AdblockDecision } from '../adblock/engine';
import { isAuthOrSecurityUrl as defaultIsAuthOrSecurityUrl } from '../urlClassifier';

/**
 * The per-session behavior that `applyInterception` in src/main/index.ts applies to the default
 * session and `persist:neutrino`, extracted so every Profile_Session gets exactly the same setup
 * (requirements 2.1-2.4, 21.3, 21.14).
 *
 * This module imports Electron only for types. Everything with side effects outside the session
 * (the adblock engine, the VPN kill switch, the main window, the UA) is injected, so it can be
 * driven by a fake session in unit tests.
 */

/** Payload of `neutrino:tracker-blocked`, unchanged from index.ts. */
export interface TrackerBlockedPayload {
  url: string;
  domain: string;
  category?: AdblockDecision['category'];
  rule?: string;
}

/** The slice of BraveShieldEngine the request handler uses. */
export interface ShieldEngineLike {
  checkUrl(url: string): AdblockDecision;
}

/** The slice of AuthHandoffController the configurator uses. */
export interface AuthHandoffLike {
  attach(contents: WebContents): void;
}

export type PermissionCheckHandler = Parameters<Session['setPermissionCheckHandler']>[0];
export type PermissionRequestHandler = Parameters<Session['setPermissionRequestHandler']>[0];

export interface SessionConfiguratorDeps {
  adblockEngine: ShieldEngineLike;
  /** Sets the browser identity / UA on a session. In the app: `applyBrowserIdentity`. */
  applyIdentity: (sess: Session) => void;
  /** Built-in VPN kill switch. In the app: `vpnController.shouldBlockForKillSwitch`. */
  shouldBlockForKillSwitch: (url: string) => boolean;
  /** YouTube playback endpoints that are never blocked. In the app: `isMediaStreamingUrl` from index.ts. */
  isMediaStreamingUrl: (url: string) => boolean;
  /** Sends `neutrino:tracker-blocked` to the main window when it exists and is not destroyed. */
  reportBlocked: (payload: TrackerBlockedPayload) => void;
  /** Defaults to `isAuthOrSecurityUrl` from urlClassifier.ts. */
  isAuthOrSecurityUrl?: (url: string) => boolean;
  /** Google sign-in handoff, attached per webContents. */
  authHandoff?: AuthHandoffLike;
  /** Defaults to allowing every permission check, as today. */
  permissionCheckHandler?: PermissionCheckHandler;
  /** Defaults to granting every permission request, as today. */
  permissionRequestHandler?: PermissionRequestHandler;
}

/** The minimal session surface `configure` touches; a real Electron Session satisfies it. */
export type ConfigurableSession = Pick<
  Session,
  'setUserAgent' | 'setPermissionCheckHandler' | 'setPermissionRequestHandler'
> & {
  webRequest: Pick<Session['webRequest'], 'onBeforeRequest'>;
};

export interface RequestOutcome {
  cancel: boolean;
}

export const REQUEST_FILTER = { urls: ['*://*/*'] };

const allowAllChecks: PermissionCheckHandler = () => true;
const grantAllRequests: PermissionRequestHandler = (_webContents, _permission, callback) => {
  callback(true);
};

export class SessionConfigurator {
  private readonly configured = new WeakSet<object>();
  private readonly isAuthOrSecurityUrl: (url: string) => boolean;

  constructor(private readonly deps: SessionConfiguratorDeps) {
    this.isAuthOrSecurityUrl = deps.isAuthOrSecurityUrl ?? defaultIsAuthOrSecurityUrl;
  }

  /**
   * The `onBeforeRequest` decision, in the same order as index.ts: internal schemes, kill switch,
   * auth/security and media streaming, then the adblock engine (reporting blocked requests).
   */
  decideRequest(url: string): RequestOutcome {
    // Allow internal UI and dev tools
    if (url.startsWith('file://') || url.startsWith('devtools://') || url.startsWith('chrome-extension://')) {
      return { cancel: false };
    }

    // Built-in VPN Kill Switch: block outbound webview traffic if tunnel drops while active
    if (this.deps.shouldBlockForKillSwitch(url)) {
      return { cancel: true };
    }

    // Never block YouTube video streams, playback feeds, authentication, CAPTCHA, or verification endpoints
    if (this.isAuthOrSecurityUrl(url) || this.deps.isMediaStreamingUrl(url)) {
      return { cancel: false };
    }

    const decision = this.deps.adblockEngine.checkUrl(url);
    if (decision.blocked) {
      this.deps.reportBlocked({
        url,
        domain: decision.domain,
        category: decision.category,
        rule: decision.rule,
      });
      return { cancel: true };
    }

    return { cancel: false };
  }

  /** True once `configure` has run for this session. */
  isConfigured(sess: object): boolean {
    return this.configured.has(sess);
  }

  /**
   * Applies identity/UA, the adblock request interception and the permission handlers to a
   * session. Idempotent: a session already configured is left alone, so the handlers are never
   * registered twice. Call before any Web_Content loads in the session.
   */
  configure(sess: ConfigurableSession): void {
    if (this.configured.has(sess)) return;
    this.configured.add(sess);

    this.deps.applyIdentity(sess as Session);

    sess.webRequest.onBeforeRequest(REQUEST_FILTER, (details, callback) => {
      callback(this.decideRequest(details.url));
    });

    // Request headers are not rewritten: Chromium's own User-Agent and Sec-CH-UA* values already
    // match navigator.userAgent and navigator.userAgentData.

    // Automatically allow webview permissions and credentials
    sess.setPermissionCheckHandler(this.deps.permissionCheckHandler ?? allowAllChecks);
    sess.setPermissionRequestHandler(this.deps.permissionRequestHandler ?? grantAllRequests);
  }

  /**
   * Auth handoff works per webContents (navigation events), not per session. Call from
   * `web-contents-created` for every webContents, whatever profile session it belongs to.
   */
  attachWebContents(contents: WebContents): void {
    this.deps.authHandoff?.attach(contents);
  }
}
