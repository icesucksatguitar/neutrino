import { app, BrowserWindow, ipcMain, session, screen, webContents, nativeTheme, Menu, clipboard, shell, safeStorage, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { BraveShieldEngine } from './adblock/engine';
import { ZenResourceManager } from './resourceManager';
import { McpServer } from './mcp/server';
import { LocalStorageManager } from './sync/storage';
import { BrowserManager } from './browserManager';
import { isGoogleAuthUrl, isAuthOrSecurityUrl, isMediaStreamingUrl } from './urlClassifier';
import { BrowserSettings, normalizeSettings } from './settings';
import { resolveShortcut } from './shortcuts';
import { randomUUID } from 'crypto';
import { HistoryClearRange, HistoryQueryOptions } from './history';
import { HistoryRegistry } from './history/registry';
import { VpnController } from './vpn';
import { applyBrowserIdentity, getBrowserUserAgent } from './browserIdentity';
import { decideWindowOpen } from './windowOpen';
import { AuthHandoffController } from './authHandoff';
import { createFsMigrationIO, runMigrationOnce } from './profiles/migration';
import { ProfileStore } from './profiles/store';
import { createProfileStoreIO } from './profiles/storeIO';
import { DEFAULT_PARTITION, partitionForProfile } from './profiles/partition';
import { asId, asIndex, asName, parseMoveOp, parseSpacePatch, resolveOpener } from './profiles/ipcInput';
import { SessionConfigurator } from './sessions/configurator';
import { SessionRegistry } from './sessions/registry';
import { addFavorite, duplicate, pin, removeFavorite, unpin } from './sidebar/layout';
import { intervalToMs } from './archive/archiver';
import { ARCHIVE_CHECK_MS, archiveListView, isArchiveDue, planArchive, pruneFile, restoreArchived } from './archive/scheduler';
import { PasswordManager } from './passwords/manager';
import { Vault } from './passwords/vault';
import { createOSAuthenticator } from './passwords/osAuth';
import { readDirectImport } from './passwords/chromeImport';
import { serializeCredentialCsv } from './passwords/csv';
import { PasswordChannel } from './passwords/channels';
import { PreviewService } from './previews/service';
import { TabWebviewRegistry } from './previews/tabWebviews';
import { dominantBitmapColor } from './topbar/sample';
import {
  MAX_CSV_BYTES,
  WebviewKindTracker,
  applyWebviewPreferences,
  isPageWebviewKind,
  captureSourceOf,
  classifySender,
  parseCapturePayload,
  parseCommitPayload,
  parseConfirmPayload,
  parseCredentialId,
  parseEditPayload,
  parseFramePayload,
  parseOrigin,
  parsePromptResponse,
  profileForPartition,
  resolveFrameContext,
  type SenderKind,
} from './passwords/ipcPolicy';

// Chromium switches. GPU and raster behaviour is left at Chromium's defaults on purpose:
// in-process-gpu, a forced num-raster-threads and forced raster features bypass the per-driver
// choices Chromium makes, and produced tile artifacts (unpainted or stale rectangles) that moved
// between machines depending on the GPU driver. See docs in the google-signin-youtube-playback-fix
// spec (design, "Forced GPU switches").
//
// Fallback for a machine whose driver still misrenders: start with NEUTRINO_DISABLE_GPU=1 or
// --neutrino-disable-gpu to use software rendering.
const gpuDisabled =
  process.env.NEUTRINO_DISABLE_GPU === '1' || process.argv.includes('--neutrino-disable-gpu');
if (gpuDisabled) {
  app.disableHardwareAcceleration();
}
app.commandLine.appendSwitch('high-dpi-support', '1');
app.commandLine.appendSwitch('enable-quic');
app.commandLine.appendSwitch('enable-fast-unload');
app.commandLine.appendSwitch('force-color-profile', 'srgb');
app.commandLine.appendSwitch('renderer-process-limit', '2');
app.commandLine.appendSwitch('process-per-site');
app.commandLine.appendSwitch('disk-cache-size', '4194304');
app.commandLine.appendSwitch('media-cache-size', '4194304');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-domain-reliability');
app.commandLine.appendSwitch('disable-sync');
app.commandLine.appendSwitch('no-pings');
app.commandLine.appendSwitch('js-flags', '--optimize-for-size --expose-gc');
app.commandLine.appendSwitch(
  'disable-features',
  'Vulkan,BackForwardCache,SpareRendererForSitePerProcess,AutofillServerCommunication,OptimizationHints,MediaRouter,CertificateTransparencyComponentUpdater'
);

let mainWindow: BrowserWindow | null = null;

type MainSiteAction = 'back' | 'forward' | 'reload' | 'hard-reload' | 'stop' | 'home' | 'open-find';

function sendSiteAction(action: MainSiteAction, source?: string): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('neutrino:site-action', { action, source });
  }
}

// Initialize Core Subsystems
const adblockEngine = new BraveShieldEngine();
const resourceManager = new ZenResourceManager();
const mcpServer = new McpServer();
const storage = new LocalStorageManager();
const dataDir = path.join(app.getPath('userData'), 'neutrino-data');
// Per-profile history: Default keeps `history.json`, other profiles use `history-<id>.json`.
const historyRegistry = new HistoryRegistry({ dir: dataDir });
// The VPN covers every registered profile session (sessionRegistry is created below; the
// callback is only read after startup).
const vpnController: VpnController = new VpnController(
  path.join(dataDir, 'vpn-config.json'),
  (): string[] => sessionRegistry.partitions()
);
// Built in app.whenReady, after migration, so the ProfileStore exists before the first tab.
let profileStore!: ProfileStore;
let browserManager!: BrowserManager;

mcpServer.start();

// Browser settings: load, fill defaults, and apply the parts owned by the main process.
let settings: BrowserSettings = normalizeSettings(storage.loadState().settings);
let isDarkMode = settings.theme !== 'light';
nativeTheme.themeSource = isDarkMode ? 'dark' : 'light';
adblockEngine.setEnabled(settings.adblockEnabled);
resourceManager.setAutoSleepEnabled(settings.zenSleepEnabled);

function applySettings(prev: BrowserSettings, next: BrowserSettings) {
  if (prev.adblockEnabled !== next.adblockEnabled) {
    adblockEngine.setEnabled(next.adblockEnabled);
    propagateSessionSettings();
  }
  if (prev.zenSleepEnabled !== next.zenSleepEnabled) {
    resourceManager.setAutoSleepEnabled(next.zenSleepEnabled);
  }
  // A shorter interval takes effect now rather than on the next tick (R16.2).
  if (prev.archiveIntervalHours !== next.archiveIntervalHours && browserManager) {
    runArchivePass();
  }
}

/** Merges a patch from the renderer, re-validates it, applies, saves and broadcasts the result. */
function updateSettings(patch: unknown): BrowserSettings {
  const safePatch =
    patch !== null && typeof patch === 'object' && !Array.isArray(patch) ? (patch as Record<string, unknown>) : {};
  const prev = settings;
  const latest = storage.loadState().settings;
  const mergedRaw: Record<string, unknown> = { ...prev, ...latest, ...safePatch };
  if (
    safePatch.spaceThemes !== null &&
    typeof safePatch.spaceThemes === 'object' &&
    !Array.isArray(safePatch.spaceThemes)
  ) {
    const prevThemes =
      prev.spaceThemes && typeof prev.spaceThemes === 'object' && !Array.isArray(prev.spaceThemes)
        ? prev.spaceThemes
        : {};
    const latestThemes =
      latest.spaceThemes && typeof latest.spaceThemes === 'object' && !Array.isArray(latest.spaceThemes)
        ? (latest.spaceThemes as Record<string, unknown>)
        : {};
    mergedRaw.spaceThemes = {
      ...prevThemes,
      ...latestThemes,
      ...(safePatch.spaceThemes as Record<string, unknown>),
    };
  }
  const next = normalizeSettings(mergedRaw);
  settings = next;
  if (
    Object.prototype.hasOwnProperty.call(safePatch, 'theme') &&
    (next.theme === 'light' || next.theme === 'dark')
  ) {
    const nextDark = next.theme !== 'light';
    if (nextDark !== isDarkMode) {
      isDarkMode = nextDark;
      nativeTheme.themeSource = isDarkMode ? 'dark' : 'light';
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setBackgroundColor(isDarkMode ? '#000000' : '#FAF7F2');
      }
    }
  }
  applySettings(prev, next);
  storage.saveSettings(next);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('neutrino:settings-updated', next);
  }
  return next;
}

          // Re-exported so existing imports from index (e.g. tests requiring dist-main/index.js) keep working.
          export { isGoogleAuthUrl, isAuthOrSecurityUrl, isMediaStreamingUrl };

          // One honest browser identity for every session (see src/main/userAgent.ts). Set before any
          // window or session exists so nothing loads with Electron's default UA.
          app.userAgentFallback = getBrowserUserAgent();

          // Continues Google sign-in in the system browser when Google refuses it in-app.
          const authHandoff = new AuthHandoffController({ getMainWindow: () => mainWindow });

          // Per-session setup (adblock interception, identity/UA, permission handlers), applied
          // identically to the default session, persist:neutrino and every profile session.
          const sessionConfigurator: SessionConfigurator = new SessionConfigurator({
            adblockEngine,
            applyIdentity: applyBrowserIdentity,
            shouldBlockForKillSwitch: (url) => vpnController.shouldBlockForKillSwitch(url),
            isMediaStreamingUrl,
            reportBlocked: (payload) => {
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('neutrino:tracker-blocked', payload);
              }
            },
            authHandoff,
          });

          // Startup partitions are brought in line by vpnController.initialize(); sessions
          // registered after that get the current VPN state applied on registration.
          let vpnInitialized = false;
          const sessionRegistry: SessionRegistry<Electron.Session> = new SessionRegistry<Electron.Session>({
            configurator: sessionConfigurator,
            fromPartition: (partition) => session.fromPartition(partition),
            onRegistered: (partition) => (vpnInitialized ? vpnController.applyToPartition(partition) : undefined),
          });

          /** Configures the default session, persist:neutrino and every profile session. */
          function setupSessions(store: ProfileStore) {
            sessionConfigurator.configure(session.defaultSession);
            sessionRegistry.ensure(DEFAULT_PARTITION);
            for (const profile of store.listProfiles()) {
              sessionRegistry.ensure(partitionForProfile(profile.id));
            }

            // Safety net: any other session that appears (e.g. a partition created outside the
            // registry) still gets interception. configure is idempotent per session.
            app.on('session-created', (sess) => {
              sessionConfigurator.configure(sess);
            });
          }

          /**
           * Shields, identity and UA changes reach every registered session (R2.8). The shields
           * engine is shared by every session's request handler, so toggling it applies
           * everywhere; identity is re-applied to each session.
           */
          function propagateSessionSettings() {
            sessionRegistry.applyToAll((sess) => applyBrowserIdentity(sess));
          }

          /** The registered partition whose session is `sess`, or null. */
          function partitionOfSession(sess: Electron.Session | undefined): string | null {
            if (!sess) return null;
            for (const partition of sessionRegistry.partitions()) {
              if (sessionRegistry.ensure(partition) === sess) return partition;
            }
            return null;
          }

          /** webContents -> tab -> profile, for popups and links opened from a page (R3.1, R3.2). */
          function openerContextFor(contents: Electron.WebContents) {
            let openerUrl = '';
            let sess: Electron.Session | undefined;
            try {
              openerUrl = contents.getURL();
              sess = contents.session;
            } catch { }
            return resolveOpener({
              tabs: browserManager.getTabs(),
              activeTab: browserManager.getActiveTab(),
              sessionPartition: partitionOfSession(sess),
              openerUrl,
              spaceForPartition: (partition) => {
                const owner = profileStore.listProfiles().find((p) => partitionForProfile(p.id) === partition);
                return owner ? profileStore.listSpaces(owner.id)[0]?.id ?? null : null;
              },
            });
          }

          /** History of the Active_Profile (R4.2-R4.4). */
          function activeHistory() {
            return historyRegistry.for(browserManager.getActiveProfileId());
          }

          // When the Active_Profile changes, open history views switch to that profile's entries.
          let lastActiveProfileId: string | null = null;
          function syncActiveProfile() {
            const id = browserManager.getActiveProfileId();
            if (id === lastActiveProfileId) return;
            lastActiveProfileId = id;
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('neutrino:history-updated', historyRegistry.for(id).getEntries({ limit: 500 }));
            }
          }

          function createWindow() {
            const iconPath = fs.existsSync(path.join(__dirname, '..', 'assets', 'icon.ico'))
              ? path.join(__dirname, '..', 'assets', 'icon.ico')
              : fs.existsSync(path.join(app.getAppPath(), 'assets', 'icon.ico'))
                ? path.join(app.getAppPath(), 'assets', 'icon.ico')
                : undefined;

            const savedState = storage.loadState();
            const savedBounds = savedState.settings?.windowBounds as
              | { width?: number; height?: number; x?: number; y?: number; isMaximized?: boolean }
              | undefined;

            const initialWidth = typeof savedBounds?.width === 'number' && savedBounds.width >= 980 ? savedBounds.width : 1400;
            const initialHeight = typeof savedBounds?.height === 'number' && savedBounds.height >= 640 ? savedBounds.height : 900;
            let initialX: number | undefined;
            let initialY: number | undefined;
            if (typeof savedBounds?.x === 'number' && typeof savedBounds?.y === 'number') {
              const displays = screen.getAllDisplays();
              const visibleOnDisplay = displays.some((d) => {
                const wa = d.workArea;
                return (
                  savedBounds.x! < wa.x + wa.width - 100 &&
                  savedBounds.x! + initialWidth > wa.x + 100 &&
                  savedBounds.y! < wa.y + wa.height - 60 &&
                  savedBounds.y! + initialHeight > wa.y + 60
                );
              });
              if (visibleOnDisplay) {
                initialX = savedBounds.x;
                initialY = savedBounds.y;
              }
            }

            mainWindow = new BrowserWindow({
              width: initialWidth,
              height: initialHeight,
              x: initialX,
              y: initialY,
              minWidth: 980,
              minHeight: 640,
              title: 'Neutrino Browser',
              backgroundColor: isDarkMode ? '#000000' : '#FAF7F2',
              icon: iconPath,
              frame: false, // Frameless window with custom macOS traffic light controls
              titleBarStyle: 'hidden',
              autoHideMenuBar: true,
              webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                webviewTag: true, // Allows embedding real Chromium WebViews without iframe restrictions
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: false,
                spellcheck: false,
                backgroundThrottling: true,
              },
            });

            if (process.platform !== 'darwin') {
              mainWindow.removeMenu();
            }

            if (savedBounds?.isMaximized) {
              mainWindow.maximize();
            }

            let boundsTimer: NodeJS.Timeout | null = null;
            const persistCurrentBounds = () => {
              if (!mainWindow || mainWindow.isDestroyed()) return;
              const isMax = mainWindow.isMaximized();
              const bounds = mainWindow.getNormalBounds ? mainWindow.getNormalBounds() : mainWindow.getBounds();
              const windowBounds = {
                width: bounds.width,
                height: bounds.height,
                x: bounds.x,
                y: bounds.y,
                isMaximized: isMax,
              };
              const merged = storage.patchSettings({ windowBounds });
              settings = normalizeSettings(merged);
            };

            const saveBounds = () => {
              if (boundsTimer) clearTimeout(boundsTimer);
              boundsTimer = setTimeout(persistCurrentBounds, 500);
            };

            mainWindow.on('resize', saveBounds);
            mainWindow.on('move', saveBounds);
            mainWindow.on('maximize', saveBounds);
            mainWindow.on('unmaximize', saveBounds);
            mainWindow.on('close', () => {
              if (boundsTimer) {
                clearTimeout(boundsTimer);
                boundsTimer = null;
              }
              persistCurrentBounds();
            });

            browserManager.setMainWindow(mainWindow);

            // Load the Arc-inspired React UI
            const isDev = process.env.VITE_DEV === 'true';
            if (isDev) {
              mainWindow.loadURL('http://localhost:3000');
            } else {
              const rendererPath = path.join(__dirname, '..', 'dist-renderer', 'index.html');
              mainWindow.loadFile(rendererPath);
            }

            let gcTimer: NodeJS.Timeout | null = null;
            const scheduleIdleTrim = (delayMs: number) => {
              if (gcTimer) clearTimeout(gcTimer);
              gcTimer = setTimeout(() => {
                gcTimer = null;
                try {
                  if (typeof global.gc === 'function') global.gc();
                } catch { }
                if (mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('neutrino:trim-memory');
                  void mainWindow.webContents.executeJavaScript('window.gc?.()').catch(() => { });
                }
              }, delayMs);
            };

            mainWindow.on('blur', () => {
              scheduleIdleTrim(1500);
            });

            // Windows / Linux browser hardware & mouse XButton navigation commands
            mainWindow.on('app-command', (_e, cmd) => {
              if (cmd === 'browser-backward') sendSiteAction('back', 'app-command');
              else if (cmd === 'browser-forward') sendSiteAction('forward', 'app-command');
              else if (cmd === 'browser-refresh') sendSiteAction('reload', 'app-command');
              else if (cmd === 'browser-stop') sendSiteAction('stop', 'app-command');
              else if (cmd === 'browser-home') sendSiteAction('home', 'app-command');
            });

            // macOS trackpad swipe navigation
            mainWindow.on('swipe', (_e, direction) => {
              if (direction === 'left') sendSiteAction('back', 'swipe');
              else if (direction === 'right') sendSiteAction('forward', 'swipe');
            });

            // Create initial tabs (renderer stays at native 100% standard desktop scale)
            mainWindow.webContents.once('did-finish-load', () => {
              mainWindow!.webContents.setZoomFactor(1.0);
              browserManager.createTab('neutrino://newtab', browserManager.getActiveSpaceId());
              scheduleIdleTrim(3200);
            });

            mainWindow.on('closed', () => {
              if (gcTimer) {
                clearTimeout(gcTimer);
                gcTimer = null;
              }
              mainWindow = null;
            });
          }

          // ----- Password manager (R6-R11, bugfix 2.8-2.13) ---------------------------------
          // Plaintext stays in main: page frames get a password only by redeeming a fill token
          // bound to their webContents/frame/origin/profile; the UI renderer gets one only from a
          // verified reveal. Prompts and lists carry no password.
          const PASSWORD_PRELOAD_PATH = path.join(__dirname, 'passwords', 'passwordPreload.js');
          /** Guest webContents ids of page webviews that received the password preload. */
          const pageWebviews = new Set<number>();
          const webviewKinds = new WebviewKindTracker();
          const vaults = new Map<string, Vault>();
          let passwordManager!: PasswordManager;

          function vaultFor(profileId: string): Vault {
            let vault = vaults.get(profileId);
            if (!vault) {
              // safeStorage is the cipher; the vault refuses every write when it is unavailable (R7.2).
              vault = new Vault({ profileId, dir: dataDir, cipher: safeStorage });
              vaults.set(profileId, vault);
            }
            return vault;
          }

          function sendToUi(channel: string, payload: unknown) {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send(channel, payload);
            }
          }

          function notifyPromptsClosed(promptIds: readonly string[]) {
            for (const promptId of promptIds) sendToUi('neutrino:password-prompt-closed', { promptId });
          }

          // ----- Hover previews (R18.3-R18.7) ----------------------------------------------
          // Keyed by tab id. The renderer reports which guest webContents hosts each tab's
          // webview; main captures it on deactivation and periodically, independent of any
          // drawer. Previews live in memory only and are dropped on close/archive.
          const PREVIEW_THUMBNAIL_WIDTH = 320;
          const PREVIEW_JPEG_QUALITY = 70;
          /** Tick of the periodic capture; PreviewService throttles each tab to once per 30 s. */
          const PREVIEW_TICK_MS = 10_000;
          const tabWebviews = new TabWebviewRegistry();
          /** Top bar tint sampling strip (R20.2): rows taken from the page top, and resample width. */
          const TOP_STRIP_HEIGHT = 4;
          const TOP_STRIP_SAMPLE_WIDTH = 256;
          const watchedPreviewGuests = new Set<number>();
          const previewService = new PreviewService(captureTabThumbnail);
          let previewTimer: NodeJS.Timeout | null = null;
          let periodicCaptureRunning = false;

          /** The live guest webContents of a tab's webview, or null. */
          function tabGuestContents(tabId: string): Electron.WebContents | null {
            const id = tabWebviews.webContentsIdOf(tabId);
            if (id === undefined) return null;
            const wc = webContents.fromId(id);
            if (!wc || wc.isDestroyed()) {
              tabWebviews.deleteWebContents(id);
              return null;
            }
            return wc;
          }

          /** Captures a tab's page as a small JPEG data URL; null when nothing can be captured. */
          async function captureTabThumbnail(tabId: string): Promise<string | null> {
            const wc = tabGuestContents(tabId);
            if (!wc) return null;
            const image = await wc.capturePage();
            if (image.isEmpty()) return null;
            const { width } = image.getSize();
            const thumb = width > PREVIEW_THUMBNAIL_WIDTH
              ? image.resize({ width: PREVIEW_THUMBNAIL_WIDTH, quality: 'good' })
              : image;
            if (thumb.isEmpty()) return null;
            return `data:image/jpeg;base64,${thumb.toJPEG(PREVIEW_JPEG_QUALITY).toString('base64')}`;
          }

          /** Periodic capture of the awake tabs the sidebar shows (active space), throttled per tab. */
          async function runPeriodicCapture() {
            if (periodicCaptureRunning) return;
            if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible() || mainWindow.isMinimized()) return;
            periodicCaptureRunning = true;
            try {
              const spaceId = browserManager.getActiveSpaceId();
              const shown = browserManager
                .getTabs()
                .filter((t) => t.spaceId === spaceId && !t.isSleeping && !t.unloaded);
              // One at a time so a large space does not trigger a burst of capturePage calls.
              for (const tab of shown) {
                await previewService.requestCapture(tab.id, 'periodic');
              }
            } catch { } finally {
              periodicCaptureRunning = false;
            }
          }

          /** Wires the preview service to tab lifecycle events and starts the periodic capture. */
          function setupPreviews() {
            for (const tab of browserManager.getTabs()) {
              if (tab.isSleeping || tab.unloaded) previewService.onSleep(tab.id);
            }
            browserManager.setTabLifecycleListener({
              onDeactivated: (tabId) => {
                void previewService.requestCapture(tabId, 'deactivation');
              },
              // Sleeping/unloaded tabs keep their last preview (R18.5).
              onSleep: (tabId) => previewService.onSleep(tabId),
              onWake: (tabId) => previewService.onWake(tabId),
              // Closed or archived tabs lose their preview (R18.7).
              onRemoved: (tabId, reason) => {
                if (reason === 'archive') previewService.onArchive(tabId);
                else previewService.onClose(tabId);
                tabWebviews.deleteTab(tabId);
              },
            });
            previewTimer = setInterval(() => void runPeriodicCapture(), PREVIEW_TICK_MS);
            previewTimer.unref?.();
          }

          function stopPreviews() {
            if (previewTimer) {
              clearInterval(previewTimer);
              previewTimer = null;
            }
          }

          // ----- Auto-archive (R16.3-R16.9) ------------------------------------------------
          // Today tabs inactive longer than `archiveIntervalHours` are closed and recorded in the
          // owning profile's archive. Decisions live in archive/scheduler.ts.
          let archiveTimer: NodeJS.Timeout | null = null;

          function notifyArchiveUpdated() {
            sendToUi('neutrino:archive-updated', archiveListView(profileStore.snapshot(), browserManager.getActiveProfileId()));
          }

          /** One archive pass over the live tabs; the active tab and audio tabs are kept (R16.5). */
          function runArchivePass() {
            const ctx = {
              now: Date.now(),
              intervalMs: intervalToMs(settings.archiveIntervalHours),
              activeTabId: browserManager.getActiveTab()?.id ?? null,
              audioTabIds: new Set(browserManager.getActiveMediaTabs()),
            };
            if (!isArchiveDue(browserManager.getTabs(), ctx)) return;
            let archived = 0;
            try {
              browserManager.applyLayout((file) => {
                const plan = planArchive(file, ctx);
                archived = plan ? plan.archivedIds.length : 0;
                return plan ? plan.file : file;
              });
            } catch (err) {
              console.error('[Archive] Archive pass failed:', err);
              return;
            }
            syncActiveProfile();
            if (archived > 0) notifyArchiveUpdated();
          }

          /** Prunes expired entries (R16.9), archives due tabs now and then on a timer. */
          function setupArchive() {
            try {
              const pruned = pruneFile(profileStore.snapshot(), Date.now());
              if (pruned) profileStore.update(() => pruned);
            } catch (err) {
              console.error('[Archive] Failed to prune the archive:', err);
            }
            runArchivePass();
            archiveTimer = setInterval(runArchivePass, ARCHIVE_CHECK_MS);
            archiveTimer.unref?.();
          }

          function stopArchive() {
            if (archiveTimer) {
              clearInterval(archiveTimer);
              archiveTimer = null;
            }
          }

          /** Binds a tab to its page webview guest after checking the guest belongs to the main UI. */
          function registerTabWebview(tabId: string, webContentsId: number): boolean {
            if (!mainWindow || mainWindow.isDestroyed()) return false;
            const wc = webContents.fromId(webContentsId);
            if (!wc || wc.isDestroyed() || wc.getType() !== 'webview') return false;
            if (wc.hostWebContents?.id !== mainWindow.webContents.id) return false;
            // Page webviews only; assistant drawer webviews are never tab previews.
            if (!pageWebviews.has(webContentsId)) return false;
            tabWebviews.set(tabId, webContentsId);
            if (!watchedPreviewGuests.has(webContentsId)) {
              watchedPreviewGuests.add(webContentsId);
              wc.once('destroyed', () => {
                watchedPreviewGuests.delete(webContentsId);
                tabWebviews.deleteWebContents(webContentsId);
              });
            }
            return true;
          }

          function setupPasswordManager() {
            passwordManager = new PasswordManager({
              vaultFor,
              profiles: profileStore,
              authenticator: createOSAuthenticator({
                isPackaged: app.isPackaged,
                resourcesPath: process.resourcesPath,
                appRoot: app.getAppPath(),
                getWindowHandle: () =>
                  mainWindow && !mainWindow.isDestroyed() ? mainWindow.getNativeWindowHandle() : null,
              }),
              clipboard,
              isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
              onPromptExpired: (promptId) => notifyPromptsClosed([promptId]),
            });
          }

          type AnyIpcEvent = Electron.IpcMainEvent | Electron.IpcMainInvokeEvent;

          function senderKindOf(event: AnyIpcEvent): SenderKind {
            const sender = event.sender;
            let type = '';
            let hostWebContentsId: number | null = null;
            let isMainFrame = false;
            try {
              type = sender.getType();
              hostWebContentsId = sender.hostWebContents?.id ?? null;
              const frame = event.senderFrame;
              const top = sender.mainFrame;
              isMainFrame =
                !!frame && !!top && frame.processId === top.processId && frame.routingId === top.routingId;
            } catch {
              return 'other';
            }
            return classifySender(
              { webContentsId: sender.id, type, hostWebContentsId, isMainFrame },
              {
                mainWindowWebContentsId: mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents.id : null,
                isPageWebview: (id) => pageWebviews.has(id),
              },
            );
          }

          const isMainUi = (event: AnyIpcEvent) => senderKindOf(event) === 'main-ui';

          /** Frame context of a page request; identity and origin come from `event.senderFrame`. */
          function pageFrameContext(event: AnyIpcEvent, hintOrigin: unknown) {
            if (senderKindOf(event) !== 'page') return null;
            let partition: string | null = null;
            try {
              partition = partitionOfSession(event.sender.session);
            } catch { }
            // The tab's owning profile is the one whose session the webview runs in (bugfix 2.12).
            const profileId = profileForPartition(
              partition,
              profileStore.listProfiles().map((p) => p.id),
              partitionForProfile,
            );
            let frame: { processId: number; routingId: number; origin: string } | null = null;
            try {
              const f = event.senderFrame;
              if (f && !f.isDestroyed()) frame = { processId: f.processId, routingId: f.routingId, origin: f.origin };
            } catch { }
            return resolveFrameContext({ profileId, webContentsId: event.sender.id, senderFrame: frame, hintOrigin });
          }

          /** Drop open prompts of every webContents in a profile session (profile deletion). */
          function discardPromptsForPartition(partition: string) {
            for (const wc of webContents.getAllWebContents()) {
              let wcPartition: string | null = null;
              try {
                wcPartition = partitionOfSession(wc.session);
              } catch { }
              if (wcPartition === partition) notifyPromptsClosed(passwordManager.discardPromptsFor(wc.id));
            }
          }

          /** Called for each new webContents: page webview tracking and prompt cleanup. */
          function attachPasswordHooks(contents: Electron.WebContents) {
            // Only the browser UI may host webviews. Page webviews get the password preload
            // (also in subframes, R8.3); assistant drawer webviews carry the marker and get none.
            contents.on('will-attach-webview', (event, webPreferences) => {
              if (!mainWindow || mainWindow.isDestroyed() || contents !== mainWindow.webContents) {
                event.preventDefault();
                return;
              }
              webviewKinds.noteWillAttach(
                applyWebviewPreferences(webPreferences as Record<string, unknown>, PASSWORD_PRELOAD_PATH),
              );
            });
            // By attach time the guest has consumed its decision; clear any leftover so it cannot
            // be applied to a later, unrelated webview.
            contents.on('did-attach-webview', () => webviewKinds.cancel());

            const id = contents.id;
            if (contents.getType() === 'webview') {
              // The guest is created synchronously right after will-attach-webview on its host.
              let lastPrefs: Record<string, unknown> | null = null;
              try {
                const getter = (contents as unknown as { getLastWebPreferences?: () => unknown }).getLastWebPreferences;
                lastPrefs = (getter?.call(contents) as Record<string, unknown> | null | undefined) ?? null;
              } catch { }
              if (isPageWebviewKind(webviewKinds.takeForNewWebview(), lastPrefs, PASSWORD_PRELOAD_PATH)) {
                pageWebviews.add(id);
              }
            }
            contents.once('destroyed', () => {
              pageWebviews.delete(id);
              notifyPromptsClosed(passwordManager.discardPromptsFor(id));
            });
          }

          function registerPasswordIpc() {
            const forbidden = { ok: false, error: 'forbidden', message: 'Not allowed.' };
            const invalid = { ok: false, error: 'invalid-input', message: 'The request was not valid.' };
            const activeProfile = () => browserManager.getActiveProfileId();

            // --- Page channels (page webviews only; frame and origin from senderFrame) ---
            ipcMain.on(PasswordChannel.Capture, (event, raw: unknown) => {
              const payload = parseCapturePayload(raw);
              if (!payload) return;
              const ctx = pageFrameContext(event, payload.frameOrigin);
              if (!ctx) return;
              const before = passwordManager.pendingPromptIds();
              const result = passwordManager.capture(captureSourceOf(ctx), {
                origin: ctx.frameOrigin,
                username: payload.username,
                password: payload.password,
              });
              const after = new Set(passwordManager.pendingPromptIds());
              notifyPromptsClosed(before.filter((pid) => !after.has(pid)));
              // The prompt event carries origin and username only, never the password (R6.10).
              if (result.kind === 'prompt') sendToUi('neutrino:password-prompt', result.prompt);
            });

            ipcMain.handle(PasswordChannel.Suggestions, async (event, raw: unknown) => {
              const payload = parseFramePayload(raw);
              if (!payload) return [];
              const ctx = pageFrameContext(event, payload.frameOrigin);
              return ctx ? passwordManager.suggestions(ctx) : [];
            });

            ipcMain.handle(PasswordChannel.FillToken, async (event, raw: unknown) => {
              const payload = parseFramePayload(raw, 'credentialId');
              if (!payload) return invalid;
              const ctx = pageFrameContext(event, payload.frameOrigin);
              if (!ctx) return forbidden;
              return passwordManager.issueFillToken(ctx, payload.credentialId);
            });

            ipcMain.handle(PasswordChannel.RedeemFill, async (event, raw: unknown) => {
              const payload = parseFramePayload(raw, 'token');
              if (!payload) return invalid;
              const ctx = pageFrameContext(event, payload.frameOrigin);
              if (!ctx) return forbidden;
              return passwordManager.redeemFillToken(ctx, payload.token);
            });

            // --- Renderer channels (browser UI main frame only) ---
            ipcMain.handle('neutrino:password-prompt-respond', async (event, raw: unknown) => {
              if (!isMainUi(event)) return forbidden;
              const payload = parsePromptResponse(raw);
              if (!payload) return invalid;
              return passwordManager.resolvePrompt(payload.promptId, payload.action);
            });

            ipcMain.handle('neutrino:passwords-status', async (event) => {
              if (!isMainUi(event)) return forbidden;
              return { ok: true, encryptionAvailable: safeStorage.isEncryptionAvailable() };
            });

            ipcMain.handle('neutrino:passwords-list', async (event) => {
              if (!isMainUi(event)) return [];
              return passwordManager.list(activeProfile());
            });

            ipcMain.handle('neutrino:passwords-edit', async (event, raw: unknown) => {
              if (!isMainUi(event)) return forbidden;
              const payload = parseEditPayload(raw);
              if (!payload) return invalid;
              return passwordManager.edit(activeProfile(), payload.credentialId, payload.patch);
            });

            ipcMain.handle('neutrino:passwords-delete', async (event, raw: unknown) => {
              if (!isMainUi(event)) return forbidden;
              const credentialId = parseCredentialId(raw);
              if (!credentialId) return invalid;
              return passwordManager.remove(activeProfile(), credentialId);
            });

            // Reveal is the only response that carries plaintext, after verification (R9.2, R10.2).
            ipcMain.handle('neutrino:passwords-reveal', async (event, raw: unknown) => {
              if (!isMainUi(event)) return { status: 'error', ...forbidden };
              const credentialId = parseCredentialId(raw);
              if (!credentialId) return { status: 'error', ...invalid };
              return passwordManager.reveal(activeProfile(), credentialId);
            });

            // Copy writes the clipboard in main and returns no plaintext (R10.3, R10.4).
            ipcMain.handle('neutrino:passwords-copy', async (event, raw: unknown) => {
              if (!isMainUi(event)) return { status: 'error', ...forbidden };
              const credentialId = parseCredentialId(raw);
              if (!credentialId) return { status: 'error', ...invalid };
              return passwordManager.copy(activeProfile(), credentialId);
            });

            ipcMain.handle('neutrino:passwords-confirm', async (event, raw: unknown) => {
              if (!isMainUi(event)) return { status: 'error', ...forbidden };
              const payload = parseConfirmPayload(raw);
              if (!payload) return { status: 'error', ...invalid };
              return passwordManager.confirm(payload.confirmId, payload.accepted);
            });

            ipcMain.handle('neutrino:passwords-never-list', async (event) => {
              if (!isMainUi(event)) return [];
              return passwordManager.neverList(activeProfile());
            });

            ipcMain.handle('neutrino:passwords-never-list-remove', async (event, raw: unknown) => {
              if (!isMainUi(event)) return [];
              const origin = parseOrigin(raw);
              if (!origin) return passwordManager.neverList(activeProfile());
              return passwordManager.removeFromNeverList(activeProfile(), origin);
            });

            // CSV import: main opens the picker and reads the file, so the plaintext never passes
            // through the UI renderer (R11.1, R11.9).
            ipcMain.handle('neutrino:passwords-import-csv', async (event) => {
              if (!isMainUi(event) || !mainWindow) return forbidden;
              if (!safeStorage.isEncryptionAvailable()) return passwordManager.prepareCsvImport(activeProfile(), '');
              const picked = await dialog.showOpenDialog(mainWindow, {
                title: 'Import passwords',
                properties: ['openFile'],
                filters: [
                  { name: 'CSV files', extensions: ['csv'] },
                  { name: 'All files', extensions: ['*'] },
                ],
              });
              if (picked.canceled || picked.filePaths.length === 0) {
                return { ok: false, error: 'cancelled', message: 'No file was selected.' };
              }
              try {
                const file = picked.filePaths[0];
                const stat = await fs.promises.stat(file);
                if (!stat.isFile() || stat.size > MAX_CSV_BYTES) {
                  return { ok: false, error: 'file-too-large', message: 'That file is too large to import.' };
                }
                const text = await fs.promises.readFile(file, 'utf-8');
                return passwordManager.prepareCsvImport(activeProfile(), text);
              } catch (err) {
                console.error('[Passwords] Failed to read CSV import file:', err);
                return { ok: false, error: 'read-failed', message: 'The file could not be read.' };
              }
            });

            // Direct import from Chrome/Edge (R11.5-R11.7): rows go into the same prepare/commit
            // flow; on "not possible" the UI shows the CSV export steps.
            ipcMain.handle('neutrino:passwords-import-browser', async (event) => {
              if (!isMainUi(event)) return forbidden;
              const profileId = activeProfile();
              if (!safeStorage.isEncryptionAvailable()) return passwordManager.prepareCsvImport(profileId, '');
              const direct = readDirectImport({
                isPackaged: app.isPackaged,
                resourcesPath: process.resourcesPath,
                appRoot: app.getAppPath(),
              });
              if (!direct.ok) return direct;
              try {
                const prepared = passwordManager.prepareCsvImport(profileId, serializeCredentialCsv(direct.rows));
                return prepared.ok ? { ...prepared, browsers: direct.browsers } : prepared;
              } finally {
                // Discard the decrypted rows (R11.9).
                for (const row of direct.rows) row.password = '';
                direct.rows.length = 0;
              }
            });

            ipcMain.handle('neutrino:passwords-import-commit', async (event, raw: unknown) => {
              if (!isMainUi(event)) return forbidden;
              const payload = parseCommitPayload(raw);
              if (!payload) return invalid;
              return passwordManager.commitImport(payload.importId, payload.choices);
            });

            ipcMain.handle('neutrino:passwords-import-cancel', async (event, raw: unknown) => {
              if (!isMainUi(event)) return forbidden;
              const importId = parseCredentialId(raw);
              if (importId) passwordManager.cancelImport(importId);
              return { ok: true };
            });
          }

          // Register IPC handlers
          function setupIpcHandlers() {
            authHandoff.registerIpc(ipcMain);

            ipcMain.handle('neutrino:navigate', async (_, url: string) => {
              const active = browserManager.getActiveTab();
              if (active) {
                browserManager.updateTab(active.id, { url, isLoading: true });
              }
            });

            ipcMain.handle('neutrino:go-back', async () => {
              // handled directly in webview
              sendSiteAction('back', 'ipc');
            });

            ipcMain.handle('neutrino:go-forward', async () => {
              // handled directly in webview
              sendSiteAction('forward', 'ipc');
            });

            ipcMain.handle('neutrino:reload', async () => {
              // handled directly in webview
              sendSiteAction('reload', 'ipc');
            });

            ipcMain.handle('neutrino:hard-reload', async () => {
              sendSiteAction('hard-reload', 'ipc');
            });

            ipcMain.handle('neutrino:stop-loading', async () => {
              sendSiteAction('stop', 'ipc');
            });

            ipcMain.handle('neutrino:reopen-closed-tab', async () => {
              const tab = browserManager.reopenLastClosedTab();
              syncActiveProfile();
              return tab;
            });

            ipcMain.handle('neutrino:cycle-tab', async (_, direction: 1 | -1) => {
              const tab = browserManager.cycleTab(direction === -1 ? -1 : 1);
              syncActiveProfile();
              return tab;
            });

            ipcMain.handle('neutrino:open-external-url', async (_, url: string) => {
              if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
                await shell.openExternal(url);
                return true;
              }
              return false;
            });

            ipcMain.handle('neutrino:create-tab', async (_, payload: unknown) => {
              const { url, spaceId } =
                payload !== null && typeof payload === 'object' ? (payload as { url?: unknown; spaceId?: unknown }) : {};
              const tab = browserManager.createTab(
                typeof url === 'string' && url ? url : 'neutrino://newtab',
                asId(spaceId) ?? undefined,
              );
              syncActiveProfile();
              return tab;
            });

            ipcMain.handle('neutrino:close-tab', async (_, tabId: unknown) => {
              const id = asId(tabId);
              if (!id) return;
              browserManager.closeTab(id);
              syncActiveProfile();
            });

            ipcMain.handle('neutrino:select-tab', async (_, tabId: unknown) => {
              const id = asId(tabId);
              if (!id) return;
              browserManager.setActiveTab(id);
              syncActiveProfile();
            });

            ipcMain.handle('neutrino:toggle-pin-tab', async (_, tabId: string) => {
              browserManager.togglePinTab(tabId);
            });

            ipcMain.handle('neutrino:toggle-sleep-tab', async (_, tabId: string) => {
              browserManager.toggleSleepTab(tabId);
            });

            ipcMain.handle('neutrino:select-space', async (_, spaceId: unknown) => {
              const id = asId(spaceId);
              if (!id) return;
              browserManager.setActiveSpace(id);
              syncActiveProfile();
            });

            // ----- Profiles (R1.5, R1.6, R1.8, R1.9) -----------------------------------
            const isKnownProfile = (id: string) => profileStore.listProfiles().some((p) => p.id === id);
            const isKnownSpace = (id: string) => profileStore.listSpaces().some((s) => s.id === id);
            const isKnownTab = (id: string) => browserManager.getTabs().some((t) => t.id === id);
            const isKnownFavorite = (id: string) => profileStore.snapshot().favorites.some((f) => f.id === id);
            const profileView = (p: { id: string; name: string; createdAt: number }) => ({
              ...p,
              partition: partitionForProfile(p.id),
            });

            ipcMain.handle('neutrino:list-profiles', async () => {
              return {
                profiles: profileStore.listProfiles().map(profileView),
                spaces: browserManager.getSpaces(),
                activeProfileId: browserManager.getActiveProfileId(),
                activeSpaceId: browserManager.getActiveSpaceId(),
              };
            });

            ipcMain.handle('neutrino:create-profile', async (_, rawName: unknown) => {
              const name = rawName === undefined ? 'Profile' : asName(rawName);
              if (!name) return { ok: false, error: 'invalid-name' };
              const { profile, space } = profileStore.createProfile(name);
              // The profile session is configured before any tab can load in it (R2.1).
              sessionRegistry.ensure(partitionForProfile(profile.id));
              browserManager.refreshFromStore();
              return { ok: true, profile: profileView(profile), space };
            });

            ipcMain.handle('neutrino:rename-profile', async (_, payload: unknown) => {
              const { profileId, name } =
                payload !== null && typeof payload === 'object' ? (payload as { profileId?: unknown; name?: unknown }) : {};
              const id = asId(profileId);
              if (!id || !isKnownProfile(id)) return { ok: false, error: 'unknown-profile' };
              const cleanName = asName(name);
              if (!cleanName) return { ok: false, error: 'invalid-name' };
              profileStore.renameProfile(id, cleanName);
              browserManager.refreshFromStore();
              return { ok: true, profile: profileView(profileStore.listProfiles().find((p) => p.id === id)!) };
            });

            ipcMain.handle('neutrino:delete-profile', async (_, profileId: unknown) => {
              const id = asId(profileId);
              if (!id || !isKnownProfile(id)) return { ok: false, error: 'unknown-profile' };
              if (profileStore.listProfiles().length <= 1) return { ok: false, error: 'last-profile' };
              const partition = partitionForProfile(id);
              // Popup windows still open in the profile session go first.
              for (const win of BrowserWindow.getAllWindows()) {
                if (win !== mainWindow && !win.isDestroyed() && partitionOfSession(win.webContents.session) === partition) {
                  win.destroy();
                }
              }
              // Captured-but-unsaved passwords of the profile's tabs are dropped (R6.10).
              discardPromptsForPartition(partition);
              // deleteProfile removes the profile's spaces, tabs, favorites, archive and never-list
              // synchronously, then clears the session storage and deletes history and the
              // vault-<id>.json file (storeIO.rmFiles).
              const pending = profileStore.deleteProfile(id);
              vaults.delete(id);
              browserManager.refreshFromStore(); // closes the deleted profile's tabs
              syncActiveProfile();
              try {
                await pending;
                return { ok: true };
              } catch (err) {
                console.error('[Profiles] Failed to erase profile data:', err);
                return { ok: false, error: 'erase-failed' };
              }
            });

            // ----- Spaces (R1.11, R13.7, R13.9) ------------------------------------------
            ipcMain.handle('neutrino:create-space', async (_, payload: unknown) => {
              const { name, color, profileId } =
                payload !== null && typeof payload === 'object'
                  ? (payload as { name?: unknown; color?: unknown; profileId?: unknown })
                  : {};
              let owner: string | undefined;
              if (profileId !== undefined) {
                const id = asId(profileId);
                if (!id || !isKnownProfile(id)) return null;
                owner = id;
              }
              const space = browserManager.createSpace(
                typeof name === 'string' ? name : '',
                typeof color === 'string' && color ? color : undefined,
                owner,
              );
              syncActiveProfile();
              return space;
            });

            ipcMain.handle('neutrino:update-space', async (_, payload: unknown) => {
              const { spaceId, patch } =
                payload !== null && typeof payload === 'object' ? (payload as { spaceId?: unknown; patch?: unknown }) : {};
              const id = asId(spaceId);
              if (!id || !isKnownSpace(id)) return { ok: false, error: 'unknown-space' };
              const safePatch = parseSpacePatch(patch);
              if (!safePatch) return { ok: false, error: 'invalid-patch' };
              profileStore.updateSpace(id, safePatch);
              browserManager.refreshFromStore();
              return { ok: true, space: browserManager.getSpaces().find((s) => s.id === id) };
            });

            ipcMain.handle('neutrino:reorder-space', async (_, payload: unknown) => {
              const { spaceId, toIndex } =
                payload !== null && typeof payload === 'object' ? (payload as { spaceId?: unknown; toIndex?: unknown }) : {};
              const id = asId(spaceId);
              const index = asIndex(toIndex);
              if (!id || !isKnownSpace(id)) return { ok: false, error: 'unknown-space' };
              if (index === null) return { ok: false, error: 'invalid-index' };
              profileStore.updateSpace(id, { order: index });
              browserManager.refreshFromStore();
              return { ok: true };
            });

            ipcMain.handle('neutrino:delete-space', async (_, spaceId: unknown) => {
              const id = asId(spaceId);
              if (!id || !isKnownSpace(id)) return { ok: false, error: 'unknown-space' };
              if (profileStore.listSpaces(profileStore.ownerOf(id)).length <= 1) {
                return { ok: false, error: 'last-space' };
              }
              browserManager.deleteSpace(id);
              syncActiveProfile();
              return { ok: true };
            });

            // ----- Sidebar layout (R12.10, R14, R15, R17) --------------------------------
            ipcMain.handle('neutrino:move-tab', async (_, op: unknown) => {
              const move = parseMoveOp(op, isKnownSpace);
              if (!move) return { ok: false, error: 'invalid-move' };
              const needsReload = browserManager.moveTab(move);
              syncActiveProfile();
              return { ok: true, needsReload };
            });

            ipcMain.handle('neutrino:pin-tab', async (_, tabId: unknown) => {
              const id = asId(tabId);
              if (!id || !isKnownTab(id)) return { ok: false, error: 'unknown-tab' };
              browserManager.applyLayout((file) => pin(file, id, Date.now()));
              return { ok: true };
            });

            ipcMain.handle('neutrino:unpin-tab', async (_, tabId: unknown) => {
              const id = asId(tabId);
              if (!id || !isKnownTab(id)) return { ok: false, error: 'unknown-tab' };
              browserManager.applyLayout((file) => unpin(file, id, Date.now()));
              return { ok: true };
            });

            ipcMain.handle('neutrino:add-favorite', async (_, tabId: unknown) => {
              const id = asId(tabId);
              if (!id || !isKnownTab(id)) return { ok: false, error: 'unknown-tab' };
              browserManager.applyLayout((file) => addFavorite(file, id, Date.now()));
              return { ok: true };
            });

            ipcMain.handle('neutrino:remove-favorite', async (_, favoriteId: unknown) => {
              const id = asId(favoriteId);
              if (!id || !isKnownFavorite(id)) return { ok: false, error: 'unknown-favorite' };
              browserManager.applyLayout((file) => removeFavorite(file, id));
              return { ok: true };
            });

            ipcMain.handle('neutrino:duplicate-tab', async (_, payload: unknown) => {
              const { id: rawId, spaceId } =
                payload !== null && typeof payload === 'object' ? (payload as { id?: unknown; spaceId?: unknown }) : {};
              const id = asId(rawId);
              if (!id || !(isKnownTab(id) || isKnownFavorite(id))) return { ok: false, error: 'unknown-tab' };
              let targetSpace = browserManager.getActiveSpaceId();
              if (spaceId !== undefined) {
                const sid = asId(spaceId);
                if (!sid || !isKnownSpace(sid)) return { ok: false, error: 'unknown-space' };
                targetSpace = sid;
              }
              let newId = '';
              do {
                newId = `tab-${randomUUID().slice(0, 12)}`;
              } while (isKnownTab(newId) || isKnownFavorite(newId));
              browserManager.applyLayout((file) => duplicate(file, id, newId, Date.now(), targetSpace));
              if (!isKnownTab(newId)) return { ok: false, error: 'duplicate-failed' };
              browserManager.setActiveTab(newId);
              syncActiveProfile();
              return { ok: true, tab: browserManager.getTabs().find((t) => t.id === newId) };
            });

            // ----- Archive (R16.7, R16.8): main UI only -----------------------------------
            ipcMain.handle('neutrino:list-archive', async (event) => {
              if (!isMainUi(event)) return [];
              return archiveListView(profileStore.snapshot(), browserManager.getActiveProfileId());
            });

            ipcMain.handle('neutrino:restore-archived-tab', async (event, archivedId: unknown) => {
              if (!isMainUi(event)) return { ok: false, error: 'forbidden' };
              const id = asId(archivedId);
              if (!id || !profileStore.snapshot().archive.some((a) => a.id === id)) {
                return { ok: false, error: 'unknown-archived-tab' };
              }
              let newId: string | null = null;
              try {
                browserManager.applyLayout((file) => {
                  const result = restoreArchived(file, id, browserManager.getActiveSpaceId(), Date.now(), () => {
                    let candidate: string;
                    do {
                      candidate = `tab-${randomUUID().slice(0, 12)}`;
                    } while (isKnownTab(candidate) || isKnownFavorite(candidate));
                    return candidate;
                  });
                  if (!result) return file;
                  newId = result.tab.id;
                  return result.file;
                });
              } catch (err) {
                console.error('[Archive] Restore failed:', err);
                return { ok: false, error: 'restore-failed' };
              }
              const restoredId: string | null = newId;
              if (!restoredId || !isKnownTab(restoredId)) return { ok: false, error: 'restore-failed' };
              browserManager.setActiveTab(restoredId);
              syncActiveProfile();
              notifyArchiveUpdated();
              return { ok: true, tab: browserManager.getTabs().find((t) => t.id === restoredId) };
            });

            ipcMain.handle('neutrino:reorder-tabs', async (_, { draggedTabId, targetTabId }: { draggedTabId: string; targetTabId: string }) => {
              browserManager.reorderTabs(draggedTabId, targetTabId);
            });

            ipcMain.handle('neutrino:update-tab', async (_, { tabId, partial }: { tabId: string; partial: any }) => {
              browserManager.updateTab(tabId, partial);
            });

            ipcMain.handle('neutrino:set-zoom-factor', async (_, factor: number) => {
              const active = browserManager.getActiveTab();
              if (active) {
                browserManager.updateTab(active.id, { zoomFactor: factor });
              }
            });

            ipcMain.handle('neutrino:toggle-shields', async () => {
              // Routed through the settings path so every toggle is saved and broadcast.
              const next = updateSettings({ adblockEnabled: !settings.adblockEnabled });
              return next.adblockEnabled;
            });

            ipcMain.handle('neutrino:get-settings', async () => {
              return settings;
            });

            ipcMain.handle('neutrino:update-settings', async (_, patch: unknown) => {
              return updateSettings(patch);
            });

            ipcMain.handle('neutrino:zen-optimize', async () => {
              const active = browserManager.getActiveTab();
              if (active) {
                resourceManager.sleepAllBackgroundTabs(active.id, browserManager.getActiveMediaTabs());
              }
              return {
                memorySavedMb: resourceManager.getTotalMemorySavedMb(),
                sleepingCount: resourceManager.getSleepingTabsCount(),
              };
            });

            ipcMain.handle('neutrino:media-control', async (_, { action, params }: { action: string; params?: any }) => {
              if (action === 'report-status' && params?.tabId) {
                browserManager.setTabMediaStatus(params.tabId, Boolean(params.isPlaying));
                return { success: true };
              }
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('neutrino:media-command', { action, params });
              }
              return { success: true };
            });

            ipcMain.handle('neutrino:get-shield-stats', async () => {
              return adblockEngine.getStats();
            });

            ipcMain.handle('neutrino:mcp-call', async (_, { method, params }: { method: string; params?: unknown }) => {
              return await mcpServer.handleMessage({ jsonrpc: '2.0', id: Date.now(), method, params });
            });

            ipcMain.handle('neutrino:mcp-get-logs', async () => {
              return mcpServer.getLogs();
            });

            ipcMain.handle('neutrino:window-control', (_, action: 'minimize' | 'maximize' | 'close') => {
              if (!mainWindow) return;
              if (action === 'minimize') mainWindow.minimize();
              if (action === 'maximize') {
                if (mainWindow.isMaximized()) mainWindow.unmaximize();
                else mainWindow.maximize();
              }
              if (action === 'close') mainWindow.close();
            });

            ipcMain.handle('neutrino:set-theme-mode', async (_, mode: 'dark' | 'light' | 'system') => {
              const requested = mode === 'light' ? 'light' : mode === 'system' ? 'system' : 'dark';
              nativeTheme.themeSource = requested;
              isDarkMode = requested === 'system' ? nativeTheme.shouldUseDarkColors : requested === 'dark';

              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.setBackgroundColor(isDarkMode ? '#000000' : '#FAF7F2');
              }
              return { success: true, isDark: isDarkMode };
            });

            nativeTheme.on('updated', () => {
              if (nativeTheme.themeSource === 'system') {
                const nextDark = nativeTheme.shouldUseDarkColors;
                if (nextDark !== isDarkMode) {
                  isDarkMode = nextDark;
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.setBackgroundColor(isDarkMode ? '#000000' : '#FAF7F2');
                  }
                }
              }
            });

            // Hover previews by tab id (R18.3-R18.7). Main UI only; ids are validated.
            ipcMain.handle('neutrino:register-tab-webview', async (event, raw: unknown) => {
              if (!isMainUi(event)) return false;
              const { tabId, webContentsId } =
                raw !== null && typeof raw === 'object' ? (raw as { tabId?: unknown; webContentsId?: unknown }) : {};
              const id = asId(tabId);
              if (!id || !isKnownTab(id)) return false;
              if (typeof webContentsId !== 'number' || !Number.isSafeInteger(webContentsId) || webContentsId <= 0) {
                return false;
              }
              return registerTabWebview(id, webContentsId);
            });

            /** Captures (throttled) and returns the tab's preview, or its last saved one. */
            const previewById = async (tabId: string): Promise<string | null> => {
              await previewService.requestCapture(tabId, 'periodic');
              return previewService.get(tabId)?.image ?? null;
            };

            ipcMain.handle('neutrino:capture-tab-preview-by-id', async (event, tabId: unknown) => {
              if (!isMainUi(event)) return null;
              const id = asId(tabId);
              if (!id || !isKnownTab(id)) return null;
              return previewById(id);
            });

            ipcMain.handle('neutrino:get-tab-preview', async (event, tabId: unknown) => {
              if (!isMainUi(event)) return null;
              const id = asId(tabId);
              if (!id) return null;
              return previewService.get(id)?.image ?? null;
            });

            // Top bar tint fallback (R20.2): dominant color of the top strip of the tab's page,
            // captured from the guest registered by tab id. Null when it cannot be determined.
            ipcMain.handle('neutrino:sample-tab-top-color', async (event, tabId: unknown) => {
              if (!isMainUi(event)) return null;
              const id = asId(tabId);
              if (!id || !isKnownTab(id)) return null;
              const wc = tabGuestContents(id);
              if (!wc) return null;
              try {
                const image = await wc.capturePage();
                if (image.isEmpty()) return null;
                const size = image.getSize();
                const strip = image.crop({ x: 0, y: 0, width: size.width, height: Math.min(size.height, TOP_STRIP_HEIGHT) });
                if (strip.isEmpty()) return null;
                // A fixed-size 1x resample keeps the bitmap length predictable on HiDPI displays.
                const small = strip.resize({ width: TOP_STRIP_SAMPLE_WIDTH, height: TOP_STRIP_HEIGHT, quality: 'good' });
                if (small.isEmpty()) return null;
                const { width, height } = small.getSize();
                return dominantBitmapColor(small.toBitmap(), width, height, 'bgra');
              } catch {
                return null;
              }
            });

            // Compatibility shim for the old URL-based call: resolves the URL to a tab id
            // (exact match, active space first) and uses the tab-id preview.
            ipcMain.handle('neutrino:capture-tab-preview', async (event, tabUrl: unknown) => {
              if (!isMainUi(event) || typeof tabUrl !== 'string' || !tabUrl) return null;
              const activeSpaceId = browserManager.getActiveSpaceId();
              const matches = browserManager.getTabs().filter((t) => t.url === tabUrl);
              const tab = matches.find((t) => t.spaceId === activeSpaceId) ?? matches[0];
              return tab ? previewById(tab.id) : null;
            });

            // Browsing History IPC handlers
            // History views and Command_Bar suggestions query this same path, so both show
            // only the Active_Profile's history (R4.2-R4.4).
            ipcMain.handle('neutrino:get-history', async (_, options?: HistoryQueryOptions) => {
              return activeHistory().getEntries(options);
            });

            ipcMain.handle('neutrino:delete-history-entry', async (_, target: { id?: string; url?: string; timestamp?: number }) => {
              return activeHistory().deleteEntry(target || {});
            });

            ipcMain.handle('neutrino:clear-history', async (_, range: HistoryClearRange = 'all') => {
              return activeHistory().clear(range);
            });

            historyRegistry.onChange((profileId, entries) => {
              if (profileId !== browserManager.getActiveProfileId()) return;
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('neutrino:history-updated', entries);
              }
            });

            // Built-in VPN / Privacy Tunnel IPC handlers
            ipcMain.handle('neutrino:get-vpn-status', async () => {
              return vpnController.getStatus();
            });

            ipcMain.handle('neutrino:connect-vpn', async (_, patch?: any) => {
              return vpnController.connect(patch);
            });

            ipcMain.handle('neutrino:disconnect-vpn', async () => {
              return vpnController.disconnect();
            });

            ipcMain.handle('neutrino:update-vpn-config', async (_, patch: any) => {
              return vpnController.applyConfig(patch);
            });

            ipcMain.handle('neutrino:check-vpn-ip', async () => {
              // Through the Active_Profile's session (R2.7).
              return vpnController.verifyPublicIp(partitionForProfile(browserManager.getActiveProfileId()));
            });

            vpnController.onStatusChange((status) => {
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('neutrino:vpn-status-updated', status);
              }
            });
          }

app.whenReady().then(() => {
  // One line per launch so artifact reports from different PCs can be compared.
  console.log('[GPU] hardware acceleration:', gpuDisabled ? 'off (fallback)' : 'on', JSON.stringify(app.getGPUFeatureStatus()));
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }]));
  } else {
    Menu.setApplicationMenu(null);
  }
  // Migration runs once, before the ProfileStore loads and before the first tab (R5.1).
  // A failed migration yields a runtime-only Default profile on persist:neutrino (R5.6).
  const migration = runMigrationOnce(createFsMigrationIO(dataDir));
  profileStore = new ProfileStore(
    createProfileStoreIO({
      dataDir,
      migration,
      fromPartition: (partition) => session.fromPartition(partition),
      removeHistory: (profileId) => historyRegistry.remove(profileId),
    })
  );
  // Every profile session is configured before any tab or popup can load in it (R2.1-R2.4).
  setupSessions(profileStore);
  browserManager = new BrowserManager(adblockEngine, resourceManager, mcpServer, storage, undefined, {
    profileStore,
    historyRegistry,
  });
  lastActiveProfileId = browserManager.getActiveProfileId();
  vpnController.attachLoginHandler(app);
  setupPasswordManager();
  setupIpcHandlers();
  registerPasswordIpc();
  setupPreviews();
  setupArchive();

  // Universal handlers for all WebContents (host UI & webview tabs) — registered
  // BEFORE createWindow() so mainWindow.webContents receives before-input-event.
  app.on('web-contents-created', (_, contents) => {
    sessionConfigurator.attachWebContents(contents);
    attachPasswordHooks(contents);

    // Intercept target="_blank" and window.open: sign-in and featured popups stay real child
    // windows (window.opener intact), regular links open as Neutrino tabs. Both stay in the
    // opener's profile (popup partition, new tab's space). See windowOpen.ts.
    contents.setWindowOpenHandler((details) => {
      const opener = openerContextFor(contents);
      const decision = decideWindowOpen(details, {
        isAuthOrSecurityUrl,
        mainWindow,
        activeTab: opener.activeTab,
        partition: opener.partition,
      });
      if (decision.action === 'allow') {
        return { action: 'allow', overrideBrowserWindowOptions: decision.overrideBrowserWindowOptions };
      }
      browserManager.createTab(decision.createTab.url, decision.createTab.spaceId);
      syncActiveProfile();
      return { action: 'deny' };
    });

    // Enforce VPN WebRTC policy, cosmetic adblock, YouTube skipper, and site context menus.
    vpnController.applyWebRtcPolicy(contents);
    if (contents.getType() === 'webview') {
      contents.on('dom-ready', async () => {
        try {
          const tasks: Promise<unknown>[] = [
            contents.executeJavaScript(`
              try {
                if (!window.dataLayer) window.dataLayer = [];
                if (!window.google_tag_manager) window.google_tag_manager = {};
                if (!window.fbq) { window.fbq = function() { (window.fbq.q = window.fbq.q || []).push(arguments); }; }
              } catch(e) {}
            `).catch(() => { }),
          ];
          if (adblockEngine.isEnabled()) {
            tasks.push(contents.insertCSS(adblockEngine.getCosmeticFilterCSS()).catch(() => { }));
            const url = contents.getURL();
            if (url.includes('youtube.com')) {
              tasks.push(contents.executeJavaScript(adblockEngine.getYouTubeAdSkipperScript()).catch(() => { }));
            }
          }
          await Promise.allSettled(tasks);
        } catch { }
      });

      contents.on('context-menu', (_event, params) => {
        const template: Electron.MenuItemConstructorOptions[] = [
          {
            label: 'Back',
            enabled: contents.canGoBack(),
            click: () => {
              if (!contents.isDestroyed() && contents.canGoBack()) contents.goBack();
            },
          },
          {
            label: 'Forward',
            enabled: contents.canGoForward(),
            click: () => {
              if (!contents.isDestroyed() && contents.canGoForward()) contents.goForward();
            },
          },
          {
            label: 'Reload',
            click: () => {
              if (!contents.isDestroyed()) contents.reload();
            },
          },
          { type: 'separator' },
        ];

        if (params.linkURL) {
          template.push(
            {
              label: 'Open Link in New Tab',
              click: () => {
                browserManager.createTab(params.linkURL, browserManager.getActiveSpaceId());
              },
            },
            {
              label: 'Copy Link Address',
              click: () => clipboard.writeText(params.linkURL),
            },
            { type: 'separator' },
          );
        }

        if (params.isEditable) {
          template.push(
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'selectAll' },
            { type: 'separator' },
          );
        } else if (params.selectionText) {
          template.push(
            { role: 'copy' },
            { type: 'separator' },
          );
        }

        const pageUrl = contents.getURL();
        if (pageUrl && pageUrl.startsWith('http')) {
          template.push({
            label: 'Copy Page Address',
            click: () => clipboard.writeText(pageUrl),
          });
        }

        template.push({
          label: 'Inspect Element',
          click: () => {
            if (!contents.isDestroyed()) {
              contents.inspectElement(params.x, params.y);
            }
          },
        });

        const menu = Menu.buildFromTemplate(template);
        if (mainWindow && !mainWindow.isDestroyed()) {
          menu.popup({ window: mainWindow });
        }
      });
    }

    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;

      const isWebview = contents.getType() === 'webview';
      const action = resolveShortcut(input, { isWebview });
      if (!action) return;

      if (action.type === 'escape') {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('neutrino:escape-pressed');
        }
        return;
      }

      event.preventDefault();

      switch (action.type) {
        case 'close-tab': {
          const active = browserManager.getActiveTab();
          if (active) {
            browserManager.closeTab(active.id);
          }
          break;
        }
        case 'reopen-closed-tab':
          browserManager.reopenLastClosedTab();
          break;
        case 'new-tab': {
          // R12.8: open the Command_Bar in new-tab mode; its submission creates the Today tab
          // in the active space (App.tsx).
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('neutrino:open-command-bar', { newTab: true });
          }
          break;
        }
        case 'next-tab':
          browserManager.cycleTab(1);
          break;
        case 'prev-tab':
          browserManager.cycleTab(-1);
          break;
        case 'select-space': {
          if (browserManager.selectSpaceByIndex(action.index) && mainWindow && !mainWindow.isDestroyed()) {
            const activeSpaceId = browserManager.getActiveSpaceId();
            const space = browserManager.getSpaces().find((s) => s.id === activeSpaceId);
            if (space) {
              mainWindow.webContents.send('neutrino:space-switched', { spaceId: space.id, spaceName: space.name });
            }
          }
          break;
        }
        case 'go-back':
          sendSiteAction('back', 'shortcut');
          break;
        case 'go-forward':
          sendSiteAction('forward', 'shortcut');
          break;
        case 'go-home':
          sendSiteAction('home', 'shortcut');
          break;
        case 'reload':
          sendSiteAction('reload', 'shortcut');
          break;
        case 'hard-reload':
          sendSiteAction('hard-reload', 'shortcut');
          break;
        case 'stop':
          sendSiteAction('stop', 'shortcut');
          break;
        case 'open-command-bar':
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('neutrino:open-command-bar');
          }
          break;
        case 'open-find':
          sendSiteAction('open-find', 'shortcut');
          break;
        case 'toggle-tabs':
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('neutrino:toggle-tabs');
          }
          break;
        case 'open-history':
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('neutrino:open-history');
          }
          break;
        case 'open-settings':
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('neutrino:open-settings');
          }
          break;
        case 'zoom-out': {
          if (!isWebview) break;
          const current = contents.getZoomFactor();
          const next = Math.max(0.5, Math.round((current - 0.1) * 100) / 100);
          contents.setZoomFactor(next);
          const active = browserManager.getActiveTab();
          if (active) browserManager.updateTab(active.id, { zoomFactor: next });
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('neutrino:zoom-updated', { zoomFactor: next });
          }
          break;
        }
        case 'zoom-in': {
          if (!isWebview) break;
          const current = contents.getZoomFactor();
          const next = Math.min(3.0, Math.round((current + 0.1) * 100) / 100);
          contents.setZoomFactor(next);
          const active = browserManager.getActiveTab();
          if (active) browserManager.updateTab(active.id, { zoomFactor: next });
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('neutrino:zoom-updated', { zoomFactor: next });
          }
          break;
        }
        case 'zoom-reset': {
          if (!isWebview) break;
          contents.setZoomFactor(1.0);
          const active = browserManager.getActiveTab();
          if (active) browserManager.updateTab(active.id, { zoomFactor: 1.0 });
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('neutrino:zoom-updated', { zoomFactor: 1.0 });
          }
          break;
        }
      }
      // Tab and space shortcuts can change the Active_Profile.
      syncActiveProfile();
    });
  });

  createWindow();
  vpnInitialized = true;
  void vpnController.initialize();

  // Configure newly created child browser windows (including OAuth popups)
  app.on('browser-window-created', (_, win) => {
    if (win !== mainWindow) {
      win.show();
      win.focus();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

/** Drops every in-memory password secret (pending captures, tokens, imports) on quit. */
function disposePasswords() {
  try {
    passwordManager?.dispose();
  } catch { }
}

app.on('before-quit', () => {
  disposePasswords();
  historyRegistry.destroyAll();
  void vpnController.cleanupOnQuit();
});

app.on('window-all-closed', () => {
  disposePasswords();
  historyRegistry.destroyAll();
  void vpnController.cleanupOnQuit();
  resourceManager.destroy();
  stopPreviews();
  stopArchive();
  mcpServer.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

