import React, { useEffect } from 'react';
import { useBrowser } from './hooks/useBrowser';
import { Sidebar } from './components/Sidebar';
import { Omnibox } from './components/Omnibox';
import { BrowserViewport } from './components/BrowserViewport';
import { CommandBar } from './components/CommandBar';
import { ShieldModal } from './components/ShieldModal';
import { McpModal } from './components/McpModal';
import './styles/theme.css';

export function App() {
  const {
    state,
    activeTab,
    currentSpaceTabs,
    blockedTrackers,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    isCommandBarOpen,
    setIsCommandBarOpen,
    isShieldModalOpen,
    setIsShieldModalOpen,
    isMcpModalOpen,
    setIsMcpModalOpen,
    navigate,
    createTab,
    closeTab,
    selectTab,
    togglePinTab,
    toggleSleepTab,
    selectSpace,
    toggleShields,
    zenOptimize,
  } = useBrowser();

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+T or Ctrl+K -> Command Palette / New Tab
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 't' || e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        setIsCommandBarOpen(true);
      }
      // Ctrl+W -> Close active tab
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        if (state.activeTabId) {
          closeTab(state.activeTabId);
        }
      }
      // Ctrl+S -> Toggle Sidebar
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setIsSidebarCollapsed((prev) => !prev);
      }
      // Ctrl+1..4 -> Switch Spaces
      else if ((e.ctrlKey || e.metaKey) && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        const idx = parseInt(e.key, 10) - 1;
        if (state.spaces[idx]) {
          selectSpace(state.spaces[idx].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.activeTabId, state.spaces, closeTab, selectSpace, setIsSidebarCollapsed, setIsCommandBarOpen]);

  const handleUpdateTab = (tabId: string, partial: any) => {
    // updates from webview
  };

  const handleGoBack = () => {
    const webview: any = document.querySelector('webview');
    if (webview?.canGoBack?.()) webview.goBack();
  };

  const handleGoForward = () => {
    const webview: any = document.querySelector('webview');
    if (webview?.canGoForward?.()) webview.goForward();
  };

  const handleReload = () => {
    const webview: any = document.querySelector('webview');
    if (webview?.reload) webview.reload();
  };

  return (
    <div className="app-container">
      {/* Arc-style Collapsible Sidebar */}
      <Sidebar
        spaces={state.spaces}
        activeSpaceId={state.activeSpaceId}
        tabs={currentSpaceTabs}
        activeTabId={state.activeTabId}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        onOpenCommandBar={() => setIsCommandBarOpen(true)}
        onSelectTab={selectTab}
        onCloseTab={closeTab}
        onTogglePinTab={togglePinTab}
        onToggleSleepTab={toggleSleepTab}
        onSelectSpace={selectSpace}
        onCreateTab={createTab}
      />

      {/* Main Browser Viewport Area */}
      <main className="main-viewport">
        {/* Omnibox / Top Navigation Bar */}
        <Omnibox
          activeTab={activeTab}
          shieldStats={state.shieldStats}
          resourceStats={state.resourceStats}
          onNavigate={navigate}
          onGoBack={handleGoBack}
          onGoForward={handleGoForward}
          onReload={handleReload}
          onToggleShieldModal={() => setIsShieldModalOpen(!isShieldModalOpen)}
          onToggleMcpModal={() => setIsMcpModalOpen(!isMcpModalOpen)}
          onZenOptimize={zenOptimize}
        />

        {/* Real Chromium Webview Viewport */}
        <BrowserViewport
          activeTab={activeTab}
          onUpdateTab={handleUpdateTab}
          onNavigate={navigate}
        />
      </main>

      {/* Arc-style Floating Command Bar (Ctrl+T / Ctrl+K) */}
      <CommandBar
        isOpen={isCommandBarOpen}
        tabs={state.tabs}
        spaces={state.spaces}
        onClose={() => setIsCommandBarOpen(false)}
        onNavigate={navigate}
        onSelectTab={selectTab}
        onCreateTab={createTab}
        onZenOptimize={zenOptimize}
        onToggleShields={toggleShields}
        onSelectSpace={selectSpace}
      />

      {/* Brave-style Shield Modal Flyout */}
      <ShieldModal
        isOpen={isShieldModalOpen}
        onClose={() => setIsShieldModalOpen(false)}
        stats={state.shieldStats}
        blockedItems={blockedTrackers}
        onToggleShields={toggleShields}
      />

      {/* Model Context Protocol (MCP) Inspector Modal */}
      <McpModal
        isOpen={isMcpModalOpen}
        onClose={() => setIsMcpModalOpen(false)}
      />
    </div>
  );
}

export default App;

