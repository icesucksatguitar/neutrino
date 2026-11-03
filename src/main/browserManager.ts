import { WebContents, session, BrowserWindow } from 'electron';
import { BraveShieldEngine } from './adblock/engine';
import { ZenResourceManager } from './resourceManager';
import { McpServer } from './mcp/server';
import { LocalStorageManager, Space, TabData } from './sync/storage';

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
}

export class BrowserManager {
  private tabs: Map<string, TabState> = new Map();
  private activeTabId: string | null = null;
  private activeSpaceId: string = 'space-default';
  private spaces: Space[] = [];
  private adblockEngine: BraveShieldEngine;
  private resourceManager: ZenResourceManager;
  private mcpServer: McpServer;
  private storage: LocalStorageManager;
  private mainWindow: BrowserWindow | null = null;
  private activeMediaTabs: Set<string> = new Set();

  constructor(
    adblockEngine: BraveShieldEngine,
    resourceManager: ZenResourceManager,
    mcpServer: McpServer,
    storage: LocalStorageManager
  ) {
    this.adblockEngine = adblockEngine;
    this.resourceManager = resourceManager;
    this.mcpServer = mcpServer;
    this.storage = storage;

    const savedState = this.storage.loadState();
    this.spaces = savedState.spaces;
    if (this.spaces.length > 0) {
      this.activeSpaceId = this.spaces[0].id;
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
    this.activeSpaceId = spaceId;
    // Find first tab in this space or create one
    const spaceTabs = Array.from(this.tabs.values()).filter((t) => t.spaceId === spaceId);
    if (spaceTabs.length > 0) {
      this.setActiveTab(spaceTabs[0].id);
    } else {
      this.createTab('neutrino://newtab', spaceId);
    }
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

  public createTab(url: string = 'neutrino://newtab', spaceId?: string, isPinned: boolean = false): TabState {
    const finalSpaceId = spaceId || this.activeSpaceId;
    const tabId = 'tab-' + Math.random().toString(36).substring(2, 9);

    const newTab: TabState = {
      id: tabId,
      spaceId: finalSpaceId,
      title: 'New Tab',
      url: this.adblockEngine.cleanUrl(url),
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      isPinned,
      isSleeping: false,
      blockedCount: 0,
    };

    this.tabs.set(tabId, newTab);
    this.resourceManager.registerTab(tabId);
    this.setActiveTab(tabId);
    this.notifyState();
    return newTab;
  }

  public closeTab(tabId: string) {
    if (!this.tabs.has(tabId)) return;

    this.resourceManager.unregisterTab(tabId);
    const closingTab = this.tabs.get(tabId)!;
    const currentSpaceId = closingTab.spaceId;
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
      Object.assign(tab, partial);
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

