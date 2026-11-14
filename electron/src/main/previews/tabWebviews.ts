// Maps tab ids to the guest webContents id of the tab's <webview>. Pure: no
// Electron imports. The renderer reports the pair after the webview attaches;
// main validates the webContents before calling `set` (R18.3).

export class TabWebviewRegistry {
  private readonly byTab = new Map<string, number>();
  private readonly byWebContents = new Map<number, string>();

  /** Binds `tabId` to `webContentsId`, replacing any earlier binding of either. */
  set(tabId: string, webContentsId: number): void {
    const oldWc = this.byTab.get(tabId);
    if (oldWc !== undefined) this.byWebContents.delete(oldWc);
    const oldTab = this.byWebContents.get(webContentsId);
    if (oldTab !== undefined) this.byTab.delete(oldTab);
    this.byTab.set(tabId, webContentsId);
    this.byWebContents.set(webContentsId, tabId);
  }

  webContentsIdOf(tabId: string): number | undefined {
    return this.byTab.get(tabId);
  }

  tabIdOf(webContentsId: number): string | undefined {
    return this.byWebContents.get(webContentsId);
  }

  /** The tab was closed or archived. */
  deleteTab(tabId: string): void {
    const wc = this.byTab.get(tabId);
    if (wc !== undefined) this.byWebContents.delete(wc);
    this.byTab.delete(tabId);
  }

  /** The guest webContents was destroyed (webview unmounted or remounted). */
  deleteWebContents(webContentsId: number): void {
    const tabId = this.byWebContents.get(webContentsId);
    if (tabId !== undefined) this.byTab.delete(tabId);
    this.byWebContents.delete(webContentsId);
  }

  get size(): number {
    return this.byTab.size;
  }
}
