import { BrowserWindow, IpcMain, IpcMainInvokeEvent, WebContents, clipboard, shell } from 'electron';
import { GoogleAuthTracker, HandoffRequest, isOpenableExternalUrl } from './googleAuth';

/** What the renderer is told when Google refuses an in-app sign-in. Never carries the full URL. */
export interface AuthHandoffNotice {
  handoffId: string;
  provider: 'google';
  reason: HandoffRequest['reason'];
  siteHost: string;
  isPopup: boolean;
}

export type AuthHandoffResult = { ok: true; siteHost: string } | { ok: false; error: string };

export interface AuthHandoffOptions {
  getMainWindow: () => BrowserWindow | null;
  /** Injected for tests; defaults to shell.openExternal. */
  openExternal?: (url: string) => Promise<void>;
  /** Injected for tests; defaults to clipboard.writeText. */
  writeClipboard?: (text: string) => void;
}

export const AUTH_HANDOFF_CHANNELS = {
  required: 'neutrino:auth-handoff-required',
  open: 'neutrino:auth-handoff-open',
  copy: 'neutrino:auth-handoff-copy',
  dismiss: 'neutrino:auth-handoff-dismiss',
} as const;

/**
 * Continues Google sign-in in the system browser when Google refuses it inside Neutrino.
 *
 * - Watches main-frame navigations of tab webviews and popups (see GoogleAuthTracker).
 * - On a refusal page: a popup is closed (no stuck window) and the main window shows a notice with
 *   "Continue in browser". A tab is left where it is: navigating it back automatically could loop
 *   into another refusal on pages that start the sign-in by themselves.
 * - Opening happens only after the user clicks, only for the URL recorded in the main process
 *   (the renderer sends an id, never a URL), and only for http(s).
 */
export class AuthHandoffController {
  readonly tracker = new GoogleAuthTracker();
  private readonly openExternal: (url: string) => Promise<void>;
  private readonly writeClipboard: (text: string) => void;

  constructor(private readonly options: AuthHandoffOptions) {
    this.openExternal = options.openExternal ?? ((url) => shell.openExternal(url));
    this.writeClipboard = options.writeClipboard ?? ((text) => clipboard.writeText(text));
  }

  /** Call from app 'web-contents-created' for every webContents. */
  attach(contents: WebContents): void {
    const type = contents.getType();
    if (type !== 'webview' && type !== 'window') return;
    const id = contents.id;

    contents.on('did-create-window', (win) => {
      this.tracker.registerPopup(win.webContents.id, id, contents.getURL());
    });
    contents.on('did-navigate', (_event, url) => this.onNavigation(contents, url));
    contents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (isMainFrame) this.onNavigation(contents, url);
    });
    contents.once('destroyed', () => this.tracker.forget(id));
  }

  private onNavigation(contents: WebContents, url: string): void {
    const handoff = this.tracker.recordNavigation(contents.id, url);
    if (!handoff) return;

    if (handoff.isPopup) {
      // Close the refused popup on the next tick (not inside the navigation callback). The site
      // sees an ordinary "popup closed" and the notice explains why.
      setImmediate(() => {
        const win = BrowserWindow.fromWebContents(contents);
        if (win && !win.isDestroyed()) win.close();
      });
    }

    const mainWindow = this.options.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      const notice: AuthHandoffNotice = {
        handoffId: handoff.handoffId,
        provider: handoff.provider,
        reason: handoff.reason,
        siteHost: handoff.siteHost,
        isPopup: handoff.isPopup,
      };
      mainWindow.webContents.send(AUTH_HANDOFF_CHANNELS.required, notice);
    }
  }

  private isFromMainWindow(event: IpcMainInvokeEvent): boolean {
    const mainWindow = this.options.getMainWindow();
    return !!mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents;
  }

  async open(handoffId: unknown): Promise<AuthHandoffResult> {
    const handoff = this.tracker.getHandoff(handoffId);
    if (!handoff) return { ok: false, error: 'This sign-in request is no longer available.' };
    if (!isOpenableExternalUrl(handoff.targetUrl)) {
      this.tracker.resolveHandoff(handoff.handoffId);
      return { ok: false, error: 'This sign-in page cannot be opened outside Neutrino.' };
    }
    try {
      await this.openExternal(handoff.targetUrl);
    } catch (err) {
      // Keep the handoff so the user can retry or copy the link.
      const detail = err instanceof Error && err.message ? ` (${err.message})` : '';
      return { ok: false, error: `Could not open your default browser${detail}.` };
    }
    this.tracker.resolveHandoff(handoff.handoffId);
    return { ok: true, siteHost: handoff.siteHost };
  }

  copy(handoffId: unknown): AuthHandoffResult {
    const handoff = this.tracker.getHandoff(handoffId);
    if (!handoff || !isOpenableExternalUrl(handoff.targetUrl)) {
      return { ok: false, error: 'This sign-in request is no longer available.' };
    }
    try {
      this.writeClipboard(handoff.targetUrl);
      return { ok: true, siteHost: handoff.siteHost };
    } catch {
      return { ok: false, error: 'Could not copy the link.' };
    }
  }

  dismiss(handoffId: unknown): AuthHandoffResult {
    const handoff = this.tracker.resolveHandoff(handoffId);
    if (!handoff) return { ok: false, error: 'This sign-in request is no longer available.' };
    return { ok: true, siteHost: handoff.siteHost };
  }

  registerIpc(ipcMain: IpcMain): void {
    const denied: AuthHandoffResult = { ok: false, error: 'Not allowed.' };
    ipcMain.handle(AUTH_HANDOFF_CHANNELS.open, (event, handoffId: unknown) =>
      this.isFromMainWindow(event) ? this.open(handoffId) : denied
    );
    ipcMain.handle(AUTH_HANDOFF_CHANNELS.copy, (event, handoffId: unknown) =>
      this.isFromMainWindow(event) ? this.copy(handoffId) : denied
    );
    ipcMain.handle(AUTH_HANDOFF_CHANNELS.dismiss, (event, handoffId: unknown) =>
      this.isFromMainWindow(event) ? this.dismiss(handoffId) : denied
    );
  }
}
