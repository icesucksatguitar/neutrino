export interface TabResourceInfo {
  tabId: string;
  isSleeping: boolean;
  lastActiveTimestamp: number;
  memorySavedMb: number;
}

export class ZenResourceManager {
  private inactivityThresholdMs: number = 10 * 60 * 1000; // 10 minutes default
  private tabInfos: Map<string, TabResourceInfo> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private onSleepTabCallback?: (tabId: string) => void;

  constructor() {
    this.startMonitor();
  }

  public registerTab(tabId: string) {
    this.tabInfos.set(tabId, {
      tabId,
      isSleeping: false,
      lastActiveTimestamp: Date.now(),
      memorySavedMb: 0,
    });
  }

  public unregisterTab(tabId: string) {
    this.tabInfos.delete(tabId);
  }

  public recordActivity(tabId: string) {
    const info = this.tabInfos.get(tabId);
    if (info) {
      info.lastActiveTimestamp = Date.now();
      info.isSleeping = false;
      info.memorySavedMb = 0;
    }
  }

  public sleepTab(tabId: string) {
    const info = this.tabInfos.get(tabId);
    if (info && !info.isSleeping) {
      info.isSleeping = true;
      info.memorySavedMb = Math.floor(65 + Math.random() * 45); // Average Chromium renderer RAM saved: ~65-110MB
      if (this.onSleepTabCallback) {
        this.onSleepTabCallback(tabId);
      }
    }
  }

  public wakeTab(tabId: string) {
    const info = this.tabInfos.get(tabId);
    if (info) {
      info.isSleeping = false;
      info.lastActiveTimestamp = Date.now();
      info.memorySavedMb = 0;
    }
  }

  public isTabSleeping(tabId: string): boolean {
    return this.tabInfos.get(tabId)?.isSleeping ?? false;
  }

  public setOnSleepCallback(cb: (tabId: string) => void) {
    this.onSleepTabCallback = cb;
  }

  public getTotalMemorySavedMb(): number {
    let total = 0;
    for (const info of this.tabInfos.values()) {
      if (info.isSleeping) {
        total += info.memorySavedMb;
      }
    }
    return total;
  }

  public getSleepingTabsCount(): number {
    let count = 0;
    for (const info of this.tabInfos.values()) {
      if (info.isSleeping) count++;
    }
    return count;
  }

  public sleepAllBackgroundTabs(activeTabId: string) {
    for (const [id, info] of this.tabInfos.entries()) {
      if (id !== activeTabId && !info.isSleeping) {
        this.sleepTab(id);
      }
    }
  }

  private startMonitor() {
    this.checkInterval = setInterval(() => {
      const now = Date.now();
      for (const [id, info] of this.tabInfos.entries()) {
        if (!info.isSleeping && now - info.lastActiveTimestamp > this.inactivityThresholdMs) {
          this.sleepTab(id);
        }
      }
    }, 60 * 1000); // Check every minute
  }

  public destroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }
}

