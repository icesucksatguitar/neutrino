import { WebContents, session, BrowserWindow } from 'electron';
import { BraveShieldEngine } from './adblock/engine';
import { ZenResourceManager } from './resourceManager';
import { McpServer } from './mcp/server';
import { LocalStorageManager, Space, TabData } from './sync/storage';
import { HistoryManager, isRecordableHistoryUrl } from './history';

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
}

export class BrowserManager {
  private tabs: Map<string, TabState> = new Map();
  private activeTabId: string | null = null;
  private activeSpaceId: string = 'space-study';
  private spaces: Space[] = [];
  private adblockEngine: BraveShieldEngine;
  private resourceManager: ZenResourceManager;
  private mcpServer: McpServer;
  private storage: LocalStorageManager;
  private historyManager?: HistoryManager;
  private mainWindow: BrowserWindow | null = null;
  private activeMediaTabs: Set<string> = new Set();
  private closedTabs: Array<{ url: string; title: string; spaceId: string; isPinned: boolean }> = [];

  constructor(
    adblockEngine: BraveShieldEngine,
    resourceManager: ZenResourceManager,
    mcpServer: McpServer,
    storage: LocalStorageManager,
    historyManager?: HistoryManager
  ) {
    this.adblockEngine = adblockEngine;
    this.resourceManager = resourceManager;
    this.mcpServer = mcpServer;
    this.storage = storage;
    this.historyManager = historyManager;

    const savedState = this.storage.loadState();
    this.spaces = savedState.spaces;
    if (this.spaces.length > 0) {
      const savedActiveSpaceId = savedState.settings?.activeSpaceId;
      const validSaved = typeof savedActiveSpaceId === 'string' && this.spaces.some((s) => s.id === savedActiveSpaceId);
      this.activeSpaceId = validSaved ? savedActiveSpaceId : this.spaces[0].id;
    }

    this.setupResourceEvents();
    this.registerMcpTools();
  }

  public setMainWindow(win: BrowserWindow) {
    this.mainWindow = win;
  }

  public getSpaces(): Space[] {
    return this.spaces;
  }

  public getActiveSpaceId(): string {
    return this.activeSpaceId;
  }

  public setActiveSpace(spaceId: string) {
    if (this.spaces.some((s) => s.id === spaceId)) {
      this.activeSpaceId = spaceId;
      this.storage.patchSettings({ activeSpaceId: spaceId });
    } else {
      this.activeSpaceId = spaceId;
    }
    // Find first tab in this space or create one
    const spaceTabs = Array.from(this.tabs.values()).filter((t) => t.spaceId === spaceId);
    if (spaceTabs.length > 0) {
      this.setActiveTab(spaceTabs[0].id);
    } else {
      this.createTab('neutrino://newtab', spaceId);
    }
    this.notifyState();
  }

  public createSpace(name: string, color: string = '#7c9cff'): Space {
    const id = `space-${Date.now()}`;
    const newSpace: Space = { id, name, icon: 'Folder', color };
    this.spaces.push(newSpace);
    this.storage.saveState({ spaces: this.spaces });
    this.setActiveSpace(id);
    return newSpace;
  }

  public deleteSpace(spaceId: string) {
    if (this.spaces.length <= 1) return;
    this.spaces = this.spaces.filter((s) => s.id !== spaceId);
    const toRemove = Array.from(this.tabs.values()).filter((t) => t.spaceId === spaceId);
    for (const t of toRemove) {
      this.tabs.delete(t.id);
    }
    if (this.activeSpaceId === spaceId) {
      this.activeSpaceId = this.spaces[0].id;
      this.storage.patchSettings({ activeSpaceId: this.activeSpaceId });
      const remainingTabs = Array.from(this.tabs.values()).filter((t) => t.spaceId === this.activeSpaceId);
      if (remainingTabs.length > 0) {
        this.activeTabId = remainingTabs[0].id;
      } else {
        this.createTab('neutrino://newtab', this.activeSpaceId);
      }
    }
    this.storage.saveState({ spaces: this.spaces });
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
    this.storage.saveState({ spaces: this.spaces });
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

  public createTab(url: string = 'neutrino://newtab', spaceId?: string, isPinned: boolean = false): TabState {
    const finalSpaceId = spaceId || this.activeSpaceId;
    const tabId = 'tab-' + Math.random().toString(36).substring(2, 9);
    const cleanedUrl = this.adblockEngine.cleanUrl(url);

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
    };

    this.tabs.set(tabId, newTab);
    this.resourceManager.registerTab(tabId);
    if (this.historyManager && isRecordableHistoryUrl(cleanedUrl)) {
      this.historyManager.recordVisit({
        url: cleanedUrl,
        title: newTab.title,
        spaceId: finalSpaceId,
      });
    }
    this.setActiveTab(tabId);
    this.notifyState();
    return newTab;
  }

  public closeTab(tabId: string) {
    if (!this.tabs.has(tabId)) return;

    this.resourceManager.unregisterTab(tabId);
    const closingTab = this.tabs.get(tabId)!;
    const currentSpaceId = closingTab.spaceId;
    if (
      closingTab.url &&
      closingTab.url !== 'neutrino://newtab' &&
      closingTab.url !== 'about:blank'
    ) {
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
    this.tabs.delete(tabId);

    // If closing active tab, activate next available tab in this space
    if (this.activeTabId === tabId) {
      const remainingInSpace = Array.from(this.tabs.values()).filter((t) => t.spaceId === currentSpaceId);
      if (remainingInSpace.length > 0) {
        this.activeTabId = remainingInSpace[remainingInSpace.length - 1].id;
        this.resourceManager.wakeTab(this.activeTabId);
      } else {
        // create new tab in space
        this.createTab('neutrino://newtab', currentSpaceId);
        return;
      }
    }

    this.notifyState();
  }

  public reopenLastClosedTab(): TabState | null {
    const entry = this.closedTabs.pop();
    if (!entry) return null;
    const targetSpace = this.spaces.some((s) => s.id === entry.spaceId) ? entry.spaceId : this.activeSpaceId;
    const reopened = this.createTab(entry.url, targetSpace, entry.isPinned);
    if (entry.title && entry.title !== 'New Tab') {
      this.updateTab(reopened.id, { title: entry.title });
    }
    return reopened;
  }

  public cycleTab(direction: 1 | -1): TabState | null {
    const spaceTabs = Array.from(this.tabs.values()).filter((t) => t.spaceId === this.activeSpaceId);
    if (spaceTabs.length <= 1) return this.getActiveTab();
    const curIndex = spaceTabs.findIndex((t) => t.id === this.activeTabId);
    const startIndex = curIndex >= 0 ? curIndex : 0;
    const nextIndex = (startIndex + direction + spaceTabs.length) % spaceTabs.length;
    const nextTab = spaceTabs[nextIndex];
    this.setActiveTab(nextTab.id);
    return nextTab;
  }

  public selectSpaceByIndex(index: number): boolean {
    if (index < 0 || index >= this.spaces.length) return false;
    this.setActiveSpace(this.spaces[index].id);
    return true;
  }

  public setActiveTab(tabId: string) {
    if (this.tabs.has(tabId)) {
      this.activeTabId = tabId;
      const tab = this.tabs.get(tabId)!;
      tab.isSleeping = false;
      this.activeSpaceId = tab.spaceId;
      this.resourceManager.wakeTab(tabId);
      this.notifyState();
    }
  }

  public updateTab(tabId: string, partial: Partial<TabState>) {
    const tab = this.tabs.get(tabId);
    if (tab) {
      const prevUrl = tab.url;
      Object.assign(tab, partial);
      if (this.historyManager) {
        if (partial.url && partial.url !== prevUrl && isRecordableHistoryUrl(partial.url)) {
          this.historyManager.recordVisit({
            url: partial.url,
            title: partial.title ?? (partial.url === prevUrl ? tab.title : undefined),
            favicon: partial.favicon ?? (partial.url === prevUrl ? tab.favicon : undefined),
            spaceId: tab.spaceId,
          });
        } else if ((partial.title || partial.favicon) && isRecordableHistoryUrl(tab.url)) {
          this.historyManager.updateMetadata(tab.url, {
            title: partial.title,
            favicon: partial.favicon,
          });
        }
      }
      this.notifyState();
    }
  }

  public togglePinTab(tabId: string) {
    const tab = this.tabs.get(tabId);
    if (tab) {
      tab.isPinned = !tab.isPinned;
      this.notifyState();
    }
  }

  public toggleSleepTab(tabId: string) {
    const tab = this.tabs.get(tabId);
    if (tab) {
      if (tab.isSleeping) {
        this.resourceManager.wakeTab(tabId);
        tab.isSleeping = false;
      } else {
        this.resourceManager.sleepTab(tabId);
        tab.isSleeping = true;
      }
      this.notifyState();
    }
  }

  private setupResourceEvents() {
    this.resourceManager.setOnSleepCallback((tabId) => {
      const tab = this.tabs.get(tabId);
      if (tab) {
        tab.isSleeping = true;
        this.notifyState();
      }
    });
  }

  private notifyState() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('neutrino:state-update', {
        spaces: this.spaces,
        activeSpaceId: this.activeSpaceId,
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

