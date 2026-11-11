import { BrowserWindow } from 'electron';
import { BraveShieldEngine } from './adblock/engine';
import { ZenResourceManager } from './resourceManager';
import { McpServer } from './mcp/server';
import type { LocalStorageManager, LocalSyncPayload, Space, TabData } from './sync/storage';
import { HistoryManager, isRecordableHistoryUrl } from './history';
import { HistoryRegistry } from './history/registry';
import { ProfileStore } from './profiles/store';
import { migrateToProfiles } from './profiles/migration';
import { DEFAULT_PARTITION } from './profiles/partition';
import type { Profile, ProfilesFile, SpaceRecord, TabEntry, TabSection } from './profiles/types';
import {
  activationTarget,
  move,
  pin,
  spaceSwitcherOrder,
  unpin,
  type MoveOp,
} from './sidebar/layout';

export interface TabState {
  id: string;
  spaceId: string;
  title: string;
  url: string;
  favicon?: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isPinned: boolean;
  isSleeping: boolean;
  hasActiveMedia?: boolean;
  blockedCount: number;
  zoomFactor?: number;
  /** Session partition of the profile that owns the tab's space (R1.2). */
  partition: string;
  /** Sidebar section; `isPinned` mirrors `section === 'pinned'`. */
  section: TabSection;
  /** Closed pinned tab: entry kept, page not loaded (R15.3). */
  unloaded?: boolean;
  /** Epoch ms of the last time this tab was the active tab (R16.4). */
  lastActiveAt: number;
}

export type BrowserSpace = Space & { profileId: string; order: number };

export interface BrowserManagerOptions {
  /** Authoritative store for profiles, spaces and tabs. Absent: Default-only, in memory. */
  profileStore?: ProfileStore;
  /** Per-profile history. Absent: the single `historyManager` (if any) is used. */
  historyRegistry?: HistoryRegistry;
  /** Clock (epoch ms); tests inject one. */
  now?: () => number;
}

/**
 * Tab lifecycle events for observers such as the preview service (R18.3-18.7).
 * Called synchronously, before the state update reaches the renderer.
 */
export interface TabLifecycleListener {
  /** The tab stopped being the active tab (another tab was activated). */
  onDeactivated?(tabId: string): void;
  /** The tab went to sleep (Zen) or was unloaded (closed pinned tab). */
  onSleep?(tabId: string): void;
  /** The tab was woken or loaded again. */
  onWake?(tabId: string): void;
  /** The tab entry is gone: closed, or moved to the archive. */
  onRemoved?(tabId: string, reason: 'close' | 'archive'): void;
}

/** Fields the renderer may not change through `updateTab` (trust boundary). */
const PROTECTED_TAB_FIELDS = ['id', 'spaceId', 'partition', 'section', 'unloaded', 'lastActiveAt', 'isPinned'] as const;

/** Blank Today tabs are not worth restoring on restart. */
function isTransientUrl(url: string): boolean {
  return !url || url === 'neutrino://newtab' || url === 'about:blank';
}

/**
 * Builds the fallback store used when no ProfileStore is injected: one Default
 * profile on `persist:neutrino` owning the legacy spaces, kept in memory only.
 */
function fallbackStore(storage: LocalStorageManager, now: () => number): ProfileStore {
  const legacy = storage.loadState();
  const file = migrateToProfiles({ spaces: legacy.spaces }, now());
  return new ProfileStore({
    read: () => file,
    write: () => {},
    clearSession: async () => {},
    rmFiles: () => {},
    now,
  });
}

export class BrowserManager {
  private tabs: Map<string, TabState> = new Map();
  private activeTabId: string | null = null;
  private adblockEngine: BraveShieldEngine;
  private resourceManager: ZenResourceManager;
  private mcpServer: McpServer;
  private storage: LocalStorageManager;
  private historyManager?: HistoryManager;
  private historyRegistry?: HistoryRegistry;
  private profileStore: ProfileStore;
  private readonly now: () => number;
  private mainWindow: BrowserWindow | null = null;
  private activeMediaTabs: Set<string> = new Set();
  private closedTabs: Array<{ url: string; title: string; spaceId: string; isPinned: boolean }> = [];
  private lifecycle: TabLifecycleListener = {};

  constructor(
    adblockEngine: BraveShieldEngine,
    resourceManager: ZenResourceManager,
    mcpServer: McpServer,
    storage: LocalStorageManager,
    historyManager?: HistoryManager,
    options: BrowserManagerOptions = {}
  ) {
    this.adblockEngine = adblockEngine;
    this.resourceManager = resourceManager;
    this.mcpServer = mcpServer;
    this.storage = storage;
    this.historyManager = historyManager;
    this.historyRegistry = options.historyRegistry;
    this.now = options.now ?? (() => Date.now());
    this.profileStore = options.profileStore ?? fallbackStore(storage, this.now);

    const savedActiveSpaceId = this.storage.loadState().settings?.activeSpaceId;
    if (typeof savedActiveSpaceId === 'string' && this.hasSpace(savedActiveSpaceId)) {
      this.profileStore.setActiveSpace(savedActiveSpaceId);
    }

    this.setupResourceEvents();
    this.restoreTabs();
    this.registerMcpTools();
  }

  public setMainWindow(win: BrowserWindow) {
    this.mainWindow = win;
  }

  /** Registers the observer of tab deactivation, sleep, wake and removal. */
  public setTabLifecycleListener(listener: TabLifecycleListener) {
    this.lifecycle = listener;
  }

  public getProfileStore(): ProfileStore {
    return this.profileStore;
  }

  public getSpaces(): BrowserSpace[] {
    return this.profileStore.listSpaces().map((s) => ({
      id: s.id,
      name: s.name,
      icon: s.icon,
      color: s.color,
      profileId: s.profileId,
      order: s.order,
    }));
  }

  public getActiveSpaceId(): string {
    return this.profileStore.activeSpaceId();
  }

  public getActiveProfileId(): string {
    return this.profileStore.activeProfileId();
  }

  /** Partition of a tab, or of the active space when the tab is unknown. */
  public getTabPartition(tabId: string | null | undefined): string {
    const tab = tabId ? this.tabs.get(tabId) : undefined;
    return tab ? tab.partition : this.partitionFor(this.getActiveSpaceId());
  }

  /** Activates a space and its last active tab, or a new Today tab (R13.6). */
  public setActiveSpace(spaceId: string) {
    if (!this.hasSpace(spaceId)) return;
    this.profileStore.setActiveSpace(spaceId);
    this.patchSettings({ activeSpaceId: spaceId });
    const target = activationTarget(this.currentFile(), spaceId);
    if (target.type === 'tab' && this.tabs.has(target.tabId)) {
      this.setActiveTab(target.tabId);
    } else {
      this.createTab('neutrino://newtab', spaceId);
    }
    this.notifyState();
  }

  public createSpace(name: string, color: string = '#7c9cff', profileId?: string): BrowserSpace {
    const created = this.profileStore.createSpace(name, profileId);
    const updated = this.profileStore.updateSpace(created.id, { color, icon: 'Folder' });
    this.setActiveSpace(updated.id);
    return this.getSpaces().find((s) => s.id === updated.id)!;
  }

  public deleteSpace(spaceId: string) {
    if (!this.hasSpace(spaceId)) return;
    const wasActive = this.getActiveSpaceId() === spaceId;
    try {
      this.profileStore.deleteSpace(spaceId);
    } catch {
      // The only space of a profile cannot be deleted (R13.9).
      return;
    }
    for (const t of Array.from(this.tabs.values())) {
      if (t.spaceId === spaceId) this.dropTab(t.id);
    }
    if (wasActive || (this.activeTabId && !this.tabs.has(this.activeTabId))) {
      this.activeTabId = null;
      this.setActiveSpace(this.getActiveSpaceId());
      return;
    }
    this.notifyState();
  }

  /**
   * Re-reads spaces from the ProfileStore after an external change (space
   * moved to another profile, profile deleted): drops tabs of removed spaces
   * and reloads tabs whose owning profile changed.
   */
  public refreshFromStore() {
    for (const t of Array.from(this.tabs.values())) {
      if (!this.hasSpace(t.spaceId)) {
        this.dropTab(t.id);
        continue;
      }
      const partition = this.partitionFor(t.spaceId);
      if (partition !== t.partition) this.reloadInPartition(t, partition);
    }
    if (!this.activeTabId || !this.tabs.has(this.activeTabId)) {
      this.activeTabId = null;
      this.setActiveSpace(this.getActiveSpaceId());
      return;
    }
    this.persistTabs();
    this.notifyState();
  }

  public reorderTabs(draggedTabId: string, targetTabId: string) {
    if (draggedTabId === targetTabId) return;
    const tabEntries = Array.from(this.tabs.entries());
    const fromIndex = tabEntries.findIndex(([id]) => id === draggedTabId);
    const toIndex = tabEntries.findIndex(([id]) => id === targetTabId);
    if (fromIndex === -1 || toIndex === -1) return;

    const [moved] = tabEntries.splice(fromIndex, 1);
    tabEntries.splice(toIndex, 0, moved);

    this.tabs = new Map(tabEntries);
    this.persistTabs();
    this.notifyState();
  }

  /**
   * Applies a sidebar move (R17.1-17.5). A move into a space of another
   * profile reloads the tab in the destination profile's session.
   * Returns `needsReload` from the layout model.
   */
  public moveTab(op: MoveOp): boolean {
    const result = move(this.currentFile(), op, this.now());
    // applyFile reloads every tab whose owning profile (partition) changed.
    this.applyFile(result.file);
    this.notifyState();
    return result.needsReload;
  }

  /** Applies a pure layout transform (pin, favorites, duplicate, ...) over the live tabs. */
  public applyLayout(fn: (file: ProfilesFile) => ProfilesFile) {
    this.applyFile(fn(this.currentFile()));
    this.notifyState();
  }

  public setTabMediaStatus(tabId: string, hasMedia: boolean) {
    if (hasMedia) {
      this.activeMediaTabs.add(tabId);
    } else {
      this.activeMediaTabs.delete(tabId);
    }
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.hasActiveMedia = hasMedia;
      this.notifyState();
    }
  }

  public getActiveMediaTabs(): Set<string> {
    return this.activeMediaTabs;
  }

  public getTabs(): TabState[] {
    return Array.from(this.tabs.values());
  }

  public getActiveTab(): TabState | null {
    return this.activeTabId ? this.tabs.get(this.activeTabId) || null : null;
  }

  public setHistoryManager(hm: HistoryManager): void {
    this.historyManager = hm;
  }

  public setHistoryRegistry(registry: HistoryRegistry): void {
    this.historyRegistry = registry;
  }

  /** Creates a tab (a Today tab unless `isPinned`) in `spaceId`, defaulting to the active space (R12.8). */
  public createTab(url: string = 'neutrino://newtab', spaceId?: string, isPinned: boolean = false): TabState {
    const finalSpaceId = spaceId && this.hasSpace(spaceId) ? spaceId : this.getActiveSpaceId();
    const tabId = this.newTabId();
    const cleanedUrl = this.adblockEngine.cleanUrl(url);
    const section: TabSection = isPinned ? 'pinned' : 'today';

    const newTab: TabState = {
      id: tabId,
      spaceId: finalSpaceId,
      title: 'New Tab',
      url: cleanedUrl,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      isPinned,
      isSleeping: false,
      blockedCount: 0,
      partition: this.partitionFor(finalSpaceId),
      section,
      lastActiveAt: this.now(),
    };

    this.tabs.set(tabId, newTab);
    this.resourceManager.registerTab(tabId);
    const history = this.historyFor(newTab);
    if (history && isRecordableHistoryUrl(cleanedUrl)) {
      history.recordVisit({
        url: cleanedUrl,
        title: newTab.title,
        spaceId: finalSpaceId,
      });
    }
    this.setActiveTab(tabId);
    this.notifyState();
    return newTab;
  }

  /** Closes a tab. A pinned tab is unloaded and keeps its entry (R15.3); a Today tab is removed (R12.9). */
  public closeTab(tabId: string) {
    const closingTab = this.tabs.get(tabId);
    if (!closingTab) return;
    const currentSpaceId = closingTab.spaceId;

    if (closingTab.section === 'pinned') {
      if (closingTab.unloaded) return;
      this.resourceManager.unregisterTab(tabId);
      this.activeMediaTabs.delete(tabId);
      if (this.activeTabId === tabId) closingTab.lastActiveAt = this.now();
      closingTab.unloaded = true;
      closingTab.isSleeping = true;
      closingTab.isLoading = false;
      closingTab.hasActiveMedia = false;
      // Unloaded, not removed: the last preview stays (R18.5).
      this.emitLifecycle('onSleep', tabId);
    } else {
      this.resourceManager.unregisterTab(tabId);
      if (closingTab.url && closingTab.url !== 'neutrino://newtab' && closingTab.url !== 'about:blank') {
        this.closedTabs.push({
          url: closingTab.url,
          title: closingTab.title,
          spaceId: closingTab.spaceId,
          isPinned: closingTab.isPinned,
        });
        if (this.closedTabs.length > 20) {
          this.closedTabs.shift();
        }
      }
      this.activeMediaTabs.delete(tabId);
      this.tabs.delete(tabId);
      this.emitLifecycle('onRemoved', tabId, 'close');
    }

    // If closing active tab, activate next available tab in this space
    if (this.activeTabId === tabId) {
      const remainingInSpace = Array.from(this.tabs.values()).filter(
        (t) => t.spaceId === currentSpaceId && t.id !== tabId && !t.unloaded
      );
      if (remainingInSpace.length > 0) {
        this.activeTabId = null;
        this.setActiveTab(remainingInSpace[remainingInSpace.length - 1].id);
      } else {
        this.activeTabId = null;
        this.createTab('neutrino://newtab', currentSpaceId);
        return;
      }
    }

    this.persistTabs();
    this.notifyState();
  }

  public reopenLastClosedTab(): TabState | null {
    const entry = this.closedTabs.pop();
    if (!entry) return null;
    const targetSpace = this.hasSpace(entry.spaceId) ? entry.spaceId : this.getActiveSpaceId();
    const reopened = this.createTab(entry.url, targetSpace, entry.isPinned);
    if (entry.title && entry.title !== 'New Tab') {
      this.updateTab(reopened.id, { title: entry.title });
    }
    return reopened;
  }

  public cycleTab(direction: 1 | -1): TabState | null {
    const activeSpaceId = this.getActiveSpaceId();
    const spaceTabs = Array.from(this.tabs.values()).filter(
      (t) => t.spaceId === activeSpaceId && (!t.unloaded || t.id === this.activeTabId)
    );
    if (spaceTabs.length <= 1) return this.getActiveTab();
    const curIndex = spaceTabs.findIndex((t) => t.id === this.activeTabId);
    const startIndex = curIndex >= 0 ? curIndex : 0;
    const nextIndex = (startIndex + direction + spaceTabs.length) % spaceTabs.length;
    const nextTab = spaceTabs[nextIndex];
    this.setActiveTab(nextTab.id);
    return nextTab;
  }

  /** Selects the space at a 0-based index in Space_Switcher order. */
  public selectSpaceByIndex(index: number): boolean {
    const ordered = spaceSwitcherOrder(this.profileStore.snapshot());
    if (index < 0 || index >= ordered.length) return false;
    this.setActiveSpace(ordered[index].id);
    return true;
  }

  /** Activates a tab: wakes it (Zen) or loads an unloaded pinned tab (R15.4), stamps `lastActiveAt`. */
  public setActiveTab(tabId: string) {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    const now = this.now();
    const previous = this.activeTabId && this.activeTabId !== tabId ? this.tabs.get(this.activeTabId) : undefined;
    if (previous) {
      previous.lastActiveAt = now;
      // Before the renderer hides it, so the page is still painted (R18.3).
      this.emitLifecycle('onDeactivated', previous.id);
    }

    this.activeTabId = tabId;
    if (tab.unloaded) {
      tab.unloaded = false;
      this.resourceManager.registerTab(tabId);
    }
    tab.isSleeping = false;
    tab.lastActiveAt = now;
    if (this.profileStore.activeSpaceId() !== tab.spaceId && this.hasSpace(tab.spaceId)) {
      this.profileStore.setActiveSpace(tab.spaceId);
    }
    this.resourceManager.wakeTab(tabId);
    this.emitLifecycle('onWake', tabId);
    this.persistTabs();
    this.notifyState();
  }

  public updateTab(tabId: string, partial: Partial<TabState>) {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    const safe: Partial<TabState> = { ...partial };
    for (const key of PROTECTED_TAB_FIELDS) delete safe[key];

    const prevUrl = tab.url;
    const prevTitle = tab.title;
    const prevFavicon = tab.favicon;
    Object.assign(tab, safe);
    const history = this.historyFor(tab);
    if (history) {
      if (safe.url && safe.url !== prevUrl && isRecordableHistoryUrl(safe.url)) {
        history.recordVisit({
          url: safe.url,
          title: safe.title ?? (safe.url === prevUrl ? tab.title : undefined),
          favicon: safe.favicon ?? (safe.url === prevUrl ? tab.favicon : undefined),
          spaceId: tab.spaceId,
        });
      } else if ((safe.title || safe.favicon) && isRecordableHistoryUrl(tab.url)) {
        history.updateMetadata(tab.url, {
          title: safe.title,
          favicon: safe.favicon,
        });
      }
    }
    if (tab.url !== prevUrl || tab.title !== prevTitle || tab.favicon !== prevFavicon) {
      this.persistTabs();
    }
    this.notifyState();
  }

  /** Pins a Today tab or unpins a pinned tab, appending it to the other section (R15.1, R15.5). */
  public togglePinTab(tabId: string) {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    const now = this.now();
    this.applyLayout((file) => (tab.section === 'pinned' ? unpin(file, tabId, now) : pin(file, tabId, now)));
  }

  public toggleSleepTab(tabId: string) {
    const tab = this.tabs.get(tabId);
    if (tab) {
      if (tab.unloaded) {
        tab.unloaded = false;
        this.resourceManager.registerTab(tabId);
        tab.isSleeping = false;
        this.persistTabs();
        this.emitLifecycle('onWake', tabId);
      } else if (tab.isSleeping) {
        this.resourceManager.wakeTab(tabId);
        tab.isSleeping = false;
        this.emitLifecycle('onWake', tabId);
      } else {
        this.resourceManager.sleepTab(tabId);
        tab.isSleeping = true;
        this.emitLifecycle('onSleep', tabId);
      }
      this.notifyState();
    }
  }

  /** Sync package with spaces and pinned tabs read from the ProfileStore. */
  public exportSyncPackage(): string {
    const base = JSON.parse(this.storage.exportSyncPackage()) as LocalSyncPayload;
    const file = this.profileStore.snapshot();
    const spaces: Space[] = spaceSwitcherOrder(file).map((s) => ({
      id: s.id,
      name: s.name,
      icon: s.icon,
      color: s.color,
    }));
    const pinnedTabs: TabData[] = file.tabs
      .filter((t) => t.section === 'pinned')
      .map((t) => ({
        id: t.id,
        spaceId: t.spaceId,
        title: t.title,
        url: t.url,
        ...(t.favicon !== undefined ? { favicon: t.favicon } : {}),
        isPinned: true,
        isSleeping: Boolean(t.unloaded),
        order: t.order,
      }));
    return JSON.stringify({ ...base, spaces, pinnedTabs }, null, 2);
  }

  // ----- internals ---------------------------------------------------------

  private newTabId(): string {
    for (;;) {
      const id = 'tab-' + Math.random().toString(36).substring(2, 9);
      if (!this.tabs.has(id)) return id;
    }
  }

  private hasSpace(spaceId: string): boolean {
    return this.profileStore.listSpaces().some((s) => s.id === spaceId);
  }

  private partitionFor(spaceId: string): string {
    try {
      return this.profileStore.partitionForSpace(spaceId);
    } catch {
      return DEFAULT_PARTITION;
    }
  }

  /** History of the profile that owns the tab's space (R4.1). */
  private historyFor(tab: TabState): HistoryManager | undefined {
    if (this.historyRegistry && this.hasSpace(tab.spaceId)) {
      return this.historyRegistry.for(this.profileStore.ownerOf(tab.spaceId));
    }
    return this.historyManager;
  }

  private patchSettings(patch: Record<string, unknown>) {
    const storage = this.storage as Partial<LocalStorageManager>;
    if (typeof storage.patchSettings === 'function') storage.patchSettings.call(this.storage, patch);
  }

  /** Builds `TabEntry` records from the live tabs; group order follows the Map order. */
  private tabEntries(includeTransient: boolean): TabEntry[] {
    const counters = new Map<string, number>();
    const out: TabEntry[] = [];
    for (const t of this.tabs.values()) {
      if (!includeTransient && t.section === 'today' && isTransientUrl(t.url)) continue;
      const key = `${t.spaceId}\u0000${t.section}`;
      const order = counters.get(key) ?? 0;
      counters.set(key, order + 1);
      const entry: TabEntry = {
        id: t.id,
        spaceId: t.spaceId,
        section: t.section,
        url: t.url,
        title: t.title,
        order,
        lastActiveAt: t.lastActiveAt,
      };
      if (t.favicon !== undefined) entry.favicon = t.favicon;
      if (t.unloaded) entry.unloaded = true;
      out.push(entry);
    }
    return out;
  }

  /** Store snapshot with the live tabs (including blank Today tabs) as `tabs`. */
  private currentFile(): ProfilesFile {
    return { ...this.profileStore.snapshot(), tabs: this.tabEntries(true) };
  }

  /** Writes pinned and Today entries to the ProfileStore (R15.2, R16.4). */
  private persistTabs() {
    const valid = new Set(this.profileStore.listSpaces().map((s) => s.id));
    const tabs = this.tabEntries(false).filter((t) => valid.has(t.spaceId));
    try {
      this.profileStore.update((file) => ({ ...file, tabs }));
    } catch (err) {
      console.error('[BrowserManager] Failed to persist tabs:', err);
    }
  }

  /**
   * Reconciles the live tabs with a layout result: removes tabs no longer in
   * `file.tabs`, updates moved tabs, adds new entries, reorders the Map to the
   * layout order, and persists favorites/archive/tabs.
   */
  private applyFile(file: ProfilesFile) {
    const entries = new Map(file.tabs.map((t) => [t.id, t]));
    const archived = new Set(file.archive.map((a) => a.id));
    for (const tab of Array.from(this.tabs.values())) {
      if (!entries.has(tab.id)) this.dropTab(tab.id, archived.has(tab.id) ? 'archive' : 'close');
    }

    for (const entry of file.tabs) {
      const tab = this.tabs.get(entry.id);
      if (tab) {
        tab.spaceId = entry.spaceId;
        tab.section = entry.section;
        tab.isPinned = entry.section === 'pinned';
        const partition = this.partitionFor(entry.spaceId);
        if (partition !== tab.partition) this.reloadInPartition(tab, partition);
      } else {
        this.tabs.set(entry.id, this.tabFromEntry(entry, false));
      }
    }

    // Reorder: spaces in switcher order, pinned then Today, by `order`.
    const spaceRank = new Map(spaceSwitcherOrder(file).map((s, i) => [s.id, i]));
    const rank = (t: TabState) => {
      const e = entries.get(t.id);
      return [spaceRank.get(t.spaceId) ?? Number.MAX_SAFE_INTEGER, t.section === 'pinned' ? 0 : 1, e?.order ?? 0];
    };
    const sorted = Array.from(this.tabs.values()).sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2];
    });
    this.tabs = new Map(sorted.map((t) => [t.id, t]));

    const valid = new Set(file.spaces.map((s) => s.id));
    const tabs = this.tabEntries(false).filter((t) => valid.has(t.spaceId));
    try {
      this.profileStore.update(() => ({ ...file, tabs }));
    } catch (err) {
      console.error('[BrowserManager] Failed to apply layout:', err);
    }

    if (this.activeTabId && !this.tabs.has(this.activeTabId)) {
      this.activeTabId = null;
      const target = activationTarget(this.currentFile(), this.getActiveSpaceId());
      if (target.type === 'tab' && this.tabs.has(target.tabId)) this.setActiveTab(target.tabId);
      else this.createTab('neutrino://newtab', this.getActiveSpaceId());
    }
  }

  /** Removes a tab from memory without recording it as closed. */
  private dropTab(tabId: string, reason: 'close' | 'archive' = 'close') {
    this.resourceManager.unregisterTab(tabId);
    this.activeMediaTabs.delete(tabId);
    this.tabs.delete(tabId);
    this.emitLifecycle('onRemoved', tabId, reason);
  }

  /** Notifies the lifecycle listener; a failing listener never breaks tab handling. */
  private emitLifecycle<K extends keyof TabLifecycleListener>(
    event: K,
    ...args: Parameters<NonNullable<TabLifecycleListener[K]>>
  ) {
    const handler = this.lifecycle[event] as ((...a: unknown[]) => void) | undefined;
    if (!handler) return;
    try {
      handler.apply(this.lifecycle, args);
    } catch (err) {
      console.error(`[BrowserManager] Tab lifecycle listener ${event} failed:`, err);
    }
  }

  /**
   * Reloads a tab's URL in another profile's session (R17.5, R1.12). The
   * renderer remounts the webview when `partition` changes.
   */
  private reloadInPartition(tab: TabState, partition: string) {
    if (tab.partition === partition) return;
    tab.partition = partition;
    tab.canGoBack = false;
    tab.canGoForward = false;
    tab.isLoading = !tab.isSleeping && !tab.unloaded;
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('neutrino:tab-partition-changed', {
        tabId: tab.id,
        partition,
        url: tab.url,
      });
    }
  }

  private tabFromEntry(entry: TabEntry, restoring: boolean): TabState {
    const unloaded = entry.section === 'pinned' && (restoring || Boolean(entry.unloaded));
    const tab: TabState = {
      id: entry.id,
      spaceId: entry.spaceId,
      title: entry.title,
      url: entry.url,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      isPinned: entry.section === 'pinned',
      isSleeping: unloaded || restoring,
      blockedCount: 0,
      partition: this.partitionFor(entry.spaceId),
      section: entry.section,
      lastActiveAt: entry.lastActiveAt,
    };
    if (entry.favicon !== undefined) tab.favicon = entry.favicon;
    if (unloaded) tab.unloaded = true;
    else {
      this.resourceManager.registerTab(entry.id);
      if (restoring) this.resourceManager.sleepTab(entry.id);
    }
    return tab;
  }

  /** Startup: pinned tabs come back unloaded, Today tabs asleep until activated. */
  private restoreTabs() {
    const file = this.profileStore.snapshot();
    const byKey = (spaceId: string, section: TabSection) =>
      file.tabs.filter((t) => t.spaceId === spaceId && t.section === section).sort((a, b) => a.order - b.order);
    for (const space of spaceSwitcherOrder(file) as SpaceRecord[]) {
      for (const entry of [...byKey(space.id, 'pinned'), ...byKey(space.id, 'today')]) {
        if (this.tabs.has(entry.id)) continue;
        this.tabs.set(entry.id, this.tabFromEntry(entry, true));
      }
    }
  }

  private setupResourceEvents() {
    this.resourceManager.setOnSleepCallback((tabId) => {
      const tab = this.tabs.get(tabId);
      if (tab) {
        tab.isSleeping = true;
        this.emitLifecycle('onSleep', tabId);
        this.notifyState();
      }
    });
  }

  private profilesForState(): Profile[] {
    return this.profileStore.listProfiles();
  }

  private notifyState() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('neutrino:state-update', {
        spaces: this.getSpaces(),
        profiles: this.profilesForState(),
        activeSpaceId: this.getActiveSpaceId(),
        activeProfileId: this.getActiveProfileId(),
        // Every profile's favorites; the renderer shows the active space's owner's (R14.2).
        favorites: this.profileStore.snapshot().favorites,
        tabs: Array.from(this.tabs.values()),
        activeTabId: this.activeTabId,
        shieldStats: this.adblockEngine.getStats(),
        resourceStats: {
          memorySavedMb: this.resourceManager.getTotalMemorySavedMb(),
          sleepingCount: this.resourceManager.getSleepingTabsCount(),
        },
      });
    }
  }

  private registerMcpTools() {
    // 1. Navigate active or target tab
    this.mcpServer.registerTool(
      {
        name: 'browser_navigate',
        description: 'Navigates the browser to a destination URL in the active or specified tab.',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The web URL to load (e.g. https://example.com)' },
            tabId: { type: 'string', description: 'Optional ID of the tab to navigate' },
          },
          required: ['url'],
        },
      },
      async (args: { url: string; tabId?: string }) => {
        const targetId = args.tabId || this.activeTabId;
        if (!targetId || !this.tabs.has(targetId)) {
          const tab = this.createTab(args.url);
          return { success: true, tabId: tab.id, url: tab.url };
        }
        const cleaned = this.adblockEngine.cleanUrl(args.url);
        this.updateTab(targetId, { url: cleaned, isLoading: true });
        return { success: true, tabId: targetId, url: cleaned };
      }
    );

    // 2. List all tabs across spaces
    this.mcpServer.registerTool(
      {
        name: 'browser_list_tabs',
        description: 'Returns all currently open tabs with their URL, title, space, and sleeping status.',
        inputSchema: {
          type: 'object',
          properties: {
            spaceId: { type: 'string', description: 'Optional filter by space ID' },
          },
        },
      },
      async (args: { spaceId?: string }) => {
        let tabs = Array.from(this.tabs.values());
        if (args.spaceId) {
          tabs = tabs.filter((t) => t.spaceId === args.spaceId);
        }
        return {
          count: tabs.length,
          activeTabId: this.activeTabId,
          tabs: tabs.map((t) => ({
            id: t.id,
            title: t.title,
            url: t.url,
            spaceId: t.spaceId,
            isPinned: t.isPinned,
            isSleeping: t.isSleeping,
          })),
        };
      }
    );

    // 3. Create a new tab
    this.mcpServer.registerTool(
      {
        name: 'browser_create_tab',
        description: 'Opens a new tab in the specified space.',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'Initial URL' },
            spaceId: { type: 'string', description: 'Space to place tab into' },
          },
        },
      },
      async (args: { url?: string; spaceId?: string }) => {
        const tab = this.createTab(args.url || 'neutrino://newtab', args.spaceId);
        return { tabId: tab.id, url: tab.url, spaceId: tab.spaceId };
      }
    );

    // 4. Close a tab
    this.mcpServer.registerTool(
      {
        name: 'browser_close_tab',
        description: 'Closes the specified tab by ID.',
        inputSchema: {
          type: 'object',
          properties: {
            tabId: { type: 'string', description: 'Tab ID to close' },
          },
          required: ['tabId'],
        },
      },
      async (args: { tabId: string }) => {
        this.closeTab(args.tabId);
        return { success: true, closedTabId: args.tabId };
      }
    );

    // 5. Get Ad-block Shield statistics
    this.mcpServer.registerTool(
      {
        name: 'browser_get_adblock_stats',
        description: 'Returns real-time ad-block and tracker defense statistics.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      async () => {
        return this.adblockEngine.getStats();
      }
    );

    // 6. Zen Memory Optimization (Sleep background tabs, skipping tabs with active media)
    this.mcpServer.registerTool(
      {
        name: 'browser_zen_optimize',
        description: 'Hibernates inactive background tabs to aggressively minimize RAM usage (skipping tabs with active media).',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      async () => {
        if (this.activeTabId) {
          this.resourceManager.sleepAllBackgroundTabs(this.activeTabId, this.activeMediaTabs);
        }
        return {
          success: true,
          memorySavedMb: this.resourceManager.getTotalMemorySavedMb(),
          sleepingTabsCount: this.resourceManager.getSleepingTabsCount(),
        };
      }
    );

    // 7. Media Control tool (expose media control to MCP)
    this.mcpServer.registerTool(
      {
        name: 'browser_media_control',
        description: 'Controls active media (play, pause, seek, volume, status) across browser tabs.',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['play', 'pause', 'seek', 'volume', 'status'], description: 'Media command action' },
            tabId: { type: 'string', description: 'Target tab ID (optional)' },
            value: { type: 'number', description: 'Parameter value (e.g. seek position in seconds or volume 0.0-1.0)' },
          },
          required: ['action'],
        },
      },
      async (args: { action: string; tabId?: string; value?: number }) => {
        const targetTabId = args.tabId || Array.from(this.activeMediaTabs)[0] || this.activeTabId;
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('neutrino:media-command', { ...args, tabId: targetTabId });
        }
        return { success: true, targetTabId, action: args.action, value: args.value };
      }
    );
  }
}
