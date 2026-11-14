import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRightLeft,
  BookOpen,
  Briefcase,
  ChevronRight,
  Code,
  Coffee,
  Copy,
  Edit2,
  Eye,
  EyeOff,
  Folder,
  FolderOpen,
  FolderPlus,
  Globe,
  Heart,
  Home,
  Moon,
  MoreHorizontal,
  Music,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  PinOff,
  Plus,
  Sparkles,
  Star,
  StarOff,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { sidebarVisibility } from '../../main/sidebar/layout';
import { useSpaceSwipe } from '../hooks/useSpaceSwipe';
import { useSidebarDrag } from '../hooks/useSidebarDrag';
import { useHoverPreview } from '../hooks/useHoverPreview';
import { TabPreviewCard } from './TabPreviewCard';
import {
  buildSidebarView,
  contextMenuActions,
  favoriteActivation,
  moveToSpaceOp,
  type SidebarItemKind,
  type SidebarItemRef,
  type SidebarMenuAction,
  type SidebarSource,
  type SidebarView,
} from '../utils/sidebarModel';
import type { FolderRecord, MoveOp, Profile, SidebarState, Space } from '../types';
import '../styles/sidebar.css';

export type { SidebarItemKind, SidebarItemRef } from '../utils/sidebarModel';

/**
 * Commands the sidebar issues. The names match `useBrowser()` so App can pass
 * `{ ...browser, openCommandBar }` directly.
 */
export interface SidebarActions {
  selectTab: (tabId: string) => void;
  selectSpace: (spaceId: string) => void;
  createTab: (url?: string, spaceId?: string) => unknown;
  closeTab: (tabId: string) => void;
  pinTab: (tabId: string) => unknown;
  unpinTab: (tabId: string) => unknown;
  addFavorite: (tabId: string) => unknown;
  removeFavorite: (favoriteId: string) => unknown;
  duplicateTab: (id: string, spaceId?: string) => unknown;
  moveTab: (op: MoveOp) => unknown;
  createFolder?: (spaceId: string, name: string) => unknown;
  updateFolder?: (folderId: string, patch: any) => unknown;
  deleteFolder?: (folderId: string) => unknown;
  moveTabToFolder?: (tabId: string, folderId: string | null) => unknown;
  /** New tab control (R12.8): App opens the Command_Bar, which creates the tab in the active space. */
  openCommandBar: () => void;
}

type ExtraProps = React.HTMLAttributes<HTMLElement> & { draggable?: boolean; [data: `data-${string}`]: unknown };

export interface SidebarProps {
  /** Live browser state (`useBrowser().state`). */
  state: SidebarSource;
  actions: SidebarActions;
  /** `settings.sidebarExpanded`. */
  expanded: boolean;
  /** `settings.sidebarAutoHide`. */
  autoHide: boolean;
  /** Custom sidebar width in px (defaults to 240). */
  sidebarWidth?: number;
  /** Live width change during drag resize. */
  onUpdateSidebarWidth?: (width: number) => void;
  /** Persists through the settings IPC (`useSettings().updateSettings` or `updateSidebarState`). */
  onUpdateSidebarState: (patch: Partial<SidebarState>) => void;

  // Extension points (drag and drop, hover previews). Handlers returned here
  // run before the sidebar's own handlers for the same event; calling
  // `preventDefault()` in one skips the sidebar's handler.
  /** Extra attributes/handlers for each favorite, pinned or Today item. */
  itemProps?: (item: SidebarItemRef) => ExtraProps;
  /** Extra attributes/handlers for each section's list container (drop zones). */
  sectionProps?: (section: SidebarItemKind) => ExtraProps;
  /** Extra attributes/handlers for each Space_Switcher icon (drop onto a space). */
  spaceProps?: (space: Space) => ExtraProps;
  /** Rendered at the end of a section's list (for example a drop indicator). */
  renderSectionExtras?: (section: SidebarItemKind) => React.ReactNode;
  /** Overlays rendered inside the sidebar (for example a hover preview card). */
  children?: React.ReactNode;
  className?: string;
}

// ---------------------------------------------------------------------------
// Small helpers

const SPACE_ICONS: Record<string, LucideIcon> = {
  Home,
  Folder,
  BookOpen,
  Briefcase,
  Coffee,
  Star,
  Heart,
  Code,
  Music,
  Globe,
  Sparkles,
};

export const SpaceIcon: React.FC<{ space: Pick<Space, 'icon' | 'name' | 'color'>; size?: number }> = ({
  space,
  size = 14,
}) => {
  const Icon = SPACE_ICONS[space.icon];
  return (
    <span className="nsb-space-icon" style={{ color: space.color }} aria-hidden="true">
      {Icon ? <Icon size={size} /> : <span className="nsb-space-letter">{(space.name || '?').charAt(0).toUpperCase()}</span>}
    </span>
  );
};

const Favicon: React.FC<{ src?: string; size?: number }> = ({ src, size = 16 }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <Globe size={size - 2} className="nsb-favicon-fallback" aria-hidden="true" />;
  return <img src={src} alt="" width={size} height={size} className="nsb-favicon" onError={() => setFailed(true)} />;
};


const HANDLER_KEYS = [
  'onClick',
  'onContextMenu',
  'onMouseEnter',
  'onMouseLeave',
  'onPointerDown',
  'onKeyDown',
  'onDragStart',
  'onDragOver',
  'onDragLeave',
  'onDrop',
  'onDragEnd',
] as const;

/** Merges extension props over base props; extension handlers run first, then the base ones. */
function mergeProps<T extends Record<string, any>>(base: T, extra?: ExtraProps): T {
  if (!extra) return base;
  const out: Record<string, any> = { ...base, ...extra };
  for (const key of HANDLER_KEYS) {
    const a = (extra as any)[key];
    const b = (base as any)[key];
    if (typeof a === 'function' && typeof b === 'function') {
      out[key] = (e: React.SyntheticEvent) => {
        a(e);
        if (!e.defaultPrevented) b(e);
      };
    }
  }
  if (base.className || extra.className) out.className = [base.className, extra.className].filter(Boolean).join(' ');
  if (base.style || extra.style) out.style = { ...base.style, ...extra.style };
  return out as T;
}

const MENU_LABELS: Record<SidebarMenuAction, string> = {
  pin: 'Pin',
  unpin: 'Unpin',
  'add-favorite': 'Add to favorites',
  'remove-favorite': 'Remove from favorites',
  'move-to-space': 'Move to space',
  'move-to-folder': 'Move to folder',
  duplicate: 'Duplicate',
  close: 'Close',
};

const MENU_ICONS: Record<SidebarMenuAction, LucideIcon> = {
  pin: Pin,
  unpin: PinOff,
  'add-favorite': Star,
  'remove-favorite': StarOff,
  'move-to-space': ArrowRightLeft,
  'move-to-folder': Folder,
  duplicate: Copy,
  close: X,
};

interface MenuState {
  item: SidebarItemRef;
  x: number;
  y: number;
  showSpaces: boolean;
  showFolders?: boolean;
}

interface FolderMenuState {
  folder: FolderRecord;
  x: number;
  y: number;
}

const MENU_WIDTH = 210;

// ---------------------------------------------------------------------------

export const Sidebar: React.FC<SidebarProps> = ({
  state,
  actions,
  expanded,
  autoHide,
  sidebarWidth,
  onUpdateSidebarWidth,
  onUpdateSidebarState,
  itemProps,
  sectionProps,
  spaceProps,
  renderSectionExtras,
  children,
  className,
}) => {
  // --- Sidebar Resizing (R12.11) -------------------------------------------
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(sidebarWidth ?? 240);

  const handleResizeStart = (e: React.MouseEvent) => {
    if (!expanded) return;
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = sidebarWidth ?? 240;
  };

  useEffect(() => {
    if (!isResizing) return;
    document.body.classList.add('sidebar-resizing-active');

    const onMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current;
      const nextWidth = Math.max(160, Math.min(520, Math.round(startWidthRef.current + delta)));
      onUpdateSidebarWidth?.(nextWidth);
    };

    const onMouseUp = (e: MouseEvent) => {
      setIsResizing(false);
      document.body.classList.remove('sidebar-resizing-active');
      const delta = e.clientX - startXRef.current;
      const finalWidth = Math.max(160, Math.min(520, Math.round(startWidthRef.current + delta)));
      onUpdateSidebarState({ sidebarWidth: finalWidth });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      document.body.classList.remove('sidebar-resizing-active');
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isResizing, onUpdateSidebarWidth, onUpdateSidebarState]);

  // Drag and drop (R17): renders the optimistic layout while dragging/committing.
  const drag = useSidebarDrag(state, actions.moveTab);
  const view = useMemo(() => buildSidebarView(drag.displayState), [drag.displayState]);
  const { activeSpaceId, activeTabId } = state;

  // --- Auto-hide (R12.4) -----------------------------------------------------
  const [pointerX, setPointerX] = useState<number | null>(null);
  const [overSidebar, setOverSidebar] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [folderMenu, setFolderMenu] = useState<FolderMenuState | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    if (!autoHide) return;
    const onMove = (e: MouseEvent) => setPointerX(e.clientX);
    const onLeave = () => setPointerX(null);
    window.addEventListener('mousemove', onMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);
    window.addEventListener('blur', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('blur', onLeave);
    };
  }, [autoHide]);

  useEffect(() => {
    if (!folderMenu) return;
    const close = () => setFolderMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('blur', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [folderMenu]);

  // An open context menu keeps an auto-hidden sidebar visible.
  // An active drag keeps it visible too.
  const visible = sidebarVisibility(autoHide, pointerX, overSidebar || menu !== null || folderMenu !== null || drag.dragging);

  // --- Hover previews (R18.1, R18.2) -------------------------------------------
  // Nothing shows while dragging, while a context menu is open or while the sidebar is hidden.
  const preview = useHoverPreview(drag.dragging || menu !== null || folderMenu !== null || !visible);
  const hidePreview = preview.hide;
  const previewKey = preview.state?.target.key;
  useEffect(() => {
    // The hovered item was closed or moved out of view.
    if (!previewKey) return;
    const present = [view.favorites, view.pinned, view.today].some((list) => list.some((i) => i.id === previewKey));
    if (!present) hidePreview();
  }, [view, previewKey, hidePreview]);
  /** Drag handlers, then preview handlers (both chain; neither prevents default), then extensions. */
  const itemExtraProps = (item: SidebarItemRef): ExtraProps =>
    mergeProps(drag.itemProps(item) as ExtraProps, preview.itemProps(item) as ExtraProps);

  // --- Swipe between spaces (R13.3) -------------------------------------------
  // Panes: previous, current and next space on a horizontal track. useSpaceSwipe
  // moves the track by ref; the current pane is the only interactive one.
  const rootRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const swipeOrder = useMemo(() => view.spaceOrder.map((s) => ({ id: s.id, color: s.color })), [view.spaceOrder]);
  const outgoing = useSpaceSwipe({
    rootRef,
    trackRef,
    order: swipeOrder,
    activeId: activeSpaceId,
    blocked: drag.dragging || menu !== null || folderMenu !== null,
    onCommit: actions.selectSpace,
    onStart: hidePreview,
  });
  const activeIndex = view.spaceOrder.findIndex((s) => s.id === activeSpaceId);
  const prevId =
    outgoing?.side === 'prev' ? outgoing.id : activeIndex > 0 ? view.spaceOrder[activeIndex - 1].id : undefined;
  const nextId =
    outgoing?.side === 'next'
      ? outgoing.id
      : activeIndex >= 0 && activeIndex < view.spaceOrder.length - 1
        ? view.spaceOrder[activeIndex + 1].id
        : undefined;
  const displayState = drag.displayState;
  const prevView = useMemo(
    () => (prevId ? buildSidebarView({ ...displayState, activeSpaceId: prevId }) : null),
    [displayState, prevId],
  );
  const nextView = useMemo(
    () => (nextId ? buildSidebarView({ ...displayState, activeSpaceId: nextId }) : null),
    [displayState, nextId],
  );
  // Favorites belong to the profile: static above the track unless a neighbour has another profile.
  const profileOfSpace = new Map(view.groups.flatMap((g) => g.spaces.map((s) => [s.id, g.profile.id] as const)));
  const ownProfile = profileOfSpace.get(activeSpaceId);
  const favoritesInPanes = [prevId, nextId].some((id) => id !== undefined && profileOfSpace.get(id) !== ownProfile);

  // --- Context menu (R12.10) --------------------------------------------------
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('blur', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const openMenu = (item: SidebarItemRef, x: number, y: number) => {
    setMenu({
      item,
      x: Math.max(4, Math.min(x, window.innerWidth - MENU_WIDTH - 4)),
      y: Math.max(4, Math.min(y, window.innerHeight - 280)),
      showSpaces: false,
    });
  };

  const runMenuAction = (item: SidebarItemRef, action: SidebarMenuAction) => {
    switch (action) {
      case 'pin':
        actions.pinTab(item.id);
        break;
      case 'unpin':
        actions.unpinTab(item.id);
        break;
      case 'add-favorite':
        actions.addFavorite(item.id);
        break;
      case 'remove-favorite':
        actions.removeFavorite(item.id);
        break;
      case 'duplicate':
        actions.duplicateTab(item.id, item.kind === 'favorite' ? activeSpaceId : undefined);
        break;
      case 'close':
        if (item.kind === 'favorite') {
          if (item.tab) actions.closeTab(item.tab.id);
        } else {
          actions.closeTab(item.id);
        }
        break;
      case 'move-to-space':
        setMenu((m) => (m ? { ...m, showSpaces: true } : m));
        return;
      case 'move-to-folder':
        setMenu((m) => (m ? { ...m, showFolders: true } : m));
        return;
    }
    setMenu(null);
  };

  // --- Activation -------------------------------------------------------------
  const activate = (item: SidebarItemRef) => {
    if (item.kind === 'favorite' && item.favorite) {
      const target = favoriteActivation(item.favorite, state.tabs, activeSpaceId);
      if (target.type === 'select') actions.selectTab(target.tabId);
      else actions.createTab(target.url, target.spaceId);
      return;
    }
    // Unloaded pinned tabs load their saved URL when selected (R15.4).
    actions.selectTab(item.id);
  };

  const itemBaseProps = (item: SidebarItemRef) => ({
    role: 'button',
    tabIndex: 0,
    'data-sidebar-item': item.kind,
    'data-sidebar-id': item.id,
    'data-sidebar-index': item.index,
    // aria-label, not title: a native tooltip would cover the hover preview card.
    'aria-label': item.title || item.url || 'New Tab',
    onClick: () => activate(item),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate(item);
      } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
        e.preventDefault();
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        openMenu(item, r.left + 12, r.bottom);
      }
    },
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      openMenu(item, e.clientX, e.clientY);
    },
  });

  const isActiveItem = (item: SidebarItemRef) =>
    item.tab !== undefined && item.tab.id === activeTabId;
  const isSleepingItem = (item: SidebarItemRef) =>
    item.kind === 'favorite' ? false : Boolean(item.tab?.isSleeping || item.tab?.unloaded);

  // --- Rendering --------------------------------------------------------------
  const renderFavorite = (item: SidebarItemRef, inert = false) => {
    const cls = `nsb-fav ${isActiveItem(item) ? 'active' : ''} ${item.tab ? 'open' : ''}`;
    if (inert) {
      return (
        <div key={item.id} className={cls}>
          <Favicon src={item.favicon} size={18} />
        </div>
      );
    }
    const base = { ...itemBaseProps(item), className: cls };
    return (
      <div key={item.id} {...mergeProps(mergeProps(base, itemExtraProps(item)), itemProps?.(item))}>
        <Favicon src={item.favicon} size={18} />
      </div>
    );
  };
  const renderTabRow = (item: SidebarItemRef, inert = false) => {
    const active = isActiveItem(item);
    const sleeping = isSleepingItem(item);
    const cls = `nsb-tab ${active ? 'active' : ''} ${sleeping ? 'sleeping' : ''} ${item.tab?.unloaded ? 'unloaded' : ''}`;
    const content = (
      <>
        <span className="nsb-tab-favicon">
          <Favicon src={item.favicon ?? item.tab?.favicon} />
        </span>
        <span className="nsb-tab-title">{item.title || item.url || 'New Tab'}</span>
        {sleeping && (
          <span className="nsb-tab-mark" title={item.tab?.unloaded ? 'Not loaded' : 'Sleeping'}>
            <Moon size={11} aria-label={item.tab?.unloaded ? 'Not loaded' : 'Sleeping'} />
          </span>
        )}
      </>
    );
    // Neighbour panes only need to look right: no handlers, no focusable controls.
    if (inert) {
      return (
        <div key={item.id} className={cls}>
          {content}
        </div>
      );
    }
    const base = {
      ...itemBaseProps(item),
      'aria-current': active ? ('page' as const) : undefined,
      className: cls,
    };
    return (
      <div key={item.id} {...mergeProps(mergeProps(base, itemExtraProps(item)), itemProps?.(item))}>
        {content}
        <button
          type="button"
          className="nsb-tab-close"
          title={item.kind === 'pinned' ? 'Close (keeps the pin)' : 'Close tab'}
          aria-label="Close tab"
          onClick={(e) => {
            e.stopPropagation();
            actions.closeTab(item.id);
          }}
        >
          <X size={12} />
        </button>
      </div>
    );
  };
  const section = (kind: SidebarItemKind, body: React.ReactNode, cls: string) => (
    <div {...mergeProps({ className: cls, 'data-sidebar-section': kind }, sectionProps?.(kind))}>
      {body}
      {renderSectionExtras?.(kind)}
    </div>
  );

  const renderPinnedContent = (v: SidebarView, inert: boolean) => {
    const folders = v.folders || [];
    const rootPinned = v.pinned.filter((t) => !t.folderId);

    return (
      <div className="nsb-pinned-container">
        {expanded && (
          <div className="nsb-pinned-section-header">
            <span className="nsb-pinned-section-label">Pinned</span>
            {!inert && (
              <button
                type="button"
                className="nsb-folder-add-btn"
                title="New Folder"
                aria-label="New Folder"
                onClick={(e) => {
                  e.stopPropagation();
                  setCreatingFolder(true);
                }}
              >
                <FolderPlus size={12} />
              </button>
            )}
          </div>
        )}
        {!inert && creatingFolder && (
          <form
            className="nsb-folder-create-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (newFolderName.trim()) {
                actions.createFolder?.(activeSpaceId, newFolderName.trim());
              }
              setNewFolderName('');
              setCreatingFolder(false);
            }}
          >
            <Folder size={13} className="nsb-folder-form-icon" />
            <input
              autoFocus
              type="text"
              className="nsb-folder-create-input"
              placeholder="Folder name..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setCreatingFolder(false);
                  setNewFolderName('');
                }
              }}
              onBlur={() => {
                if (newFolderName.trim()) {
                  actions.createFolder?.(activeSpaceId, newFolderName.trim());
                }
                setNewFolderName('');
                setCreatingFolder(false);
              }}
            />
          </form>
        )}
        {folders.map((folder) => {
          const folderTabs = v.pinned.filter((t) => t.folderId === folder.id);
          return (
            <div
              className={`nsb-folder ${folder.collapsed ? 'collapsed' : 'expanded'}`}
              key={folder.id}
            >
              <div
                className="nsb-folder-header"
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (!inert) actions.updateFolder?.(folder.id, { collapsed: !folder.collapsed });
                }}
                onContextMenu={(e) => {
                  if (inert) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setFolderMenu({
                    folder,
                    x: Math.max(4, Math.min(e.clientX, window.innerWidth - MENU_WIDTH - 4)),
                    y: Math.max(4, Math.min(e.clientY, window.innerHeight - 200)),
                  });
                }}
              >
                <button
                  type="button"
                  className="nsb-folder-chevron-btn"
                  title={folder.collapsed ? 'Expand folder' : 'Collapse folder'}
                  aria-label={folder.collapsed ? 'Expand folder' : 'Collapse folder'}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!inert) actions.updateFolder?.(folder.id, { collapsed: !folder.collapsed });
                  }}
                >
                  <ChevronRight
                    size={11}
                    className={`nsb-folder-chevron ${!folder.collapsed ? 'expanded' : ''}`}
                  />
                </button>
                <span className="nsb-folder-icon">
                  {!folder.collapsed ? <FolderOpen size={13} /> : <Folder size={13} />}
                </span>
                {!inert && renamingFolderId === folder.id ? (
                  <input
                    autoFocus
                    type="text"
                    className="nsb-folder-rename-input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (renameValue.trim()) {
                          actions.updateFolder?.(folder.id, { name: renameValue.trim() });
                        }
                        setRenamingFolderId(null);
                      } else if (e.key === 'Escape') {
                        setRenamingFolderId(null);
                      }
                    }}
                    onBlur={() => {
                      if (renameValue.trim()) {
                        actions.updateFolder?.(folder.id, { name: renameValue.trim() });
                      }
                      setRenamingFolderId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="nsb-folder-title"
                    onDoubleClick={(e) => {
                      if (inert) return;
                      e.stopPropagation();
                      setRenamingFolderId(folder.id);
                      setRenameValue(folder.name);
                    }}
                  >
                    {folder.name}
                  </span>
                )}
                {folderTabs.length > 0 && (
                  <span className="nsb-folder-badge">{folderTabs.length}</span>
                )}
                {!inert && (
                  <button
                    type="button"
                    className="nsb-folder-menu-trigger"
                    title="Folder actions"
                    aria-label="Folder actions"
                    onClick={(e) => {
                      e.stopPropagation();
                      const r = e.currentTarget.getBoundingClientRect();
                      setFolderMenu({
                        folder,
                        x: Math.max(4, Math.min(r.left, window.innerWidth - MENU_WIDTH - 4)),
                        y: Math.max(4, Math.min(r.bottom + 4, window.innerHeight - 200)),
                      });
                    }}
                  >
                    <MoreHorizontal size={12} />
                  </button>
                )}
              </div>
              {!folder.collapsed && (
                <div className="nsb-folder-children">
                  {folderTabs.length > 0 ? (
                    folderTabs.map((item) => renderTabRow(item, inert))
                  ) : (
                    <div className="nsb-folder-empty-hint">Drop tabs here</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {rootPinned.map((item) => renderTabRow(item, inert))}
      </div>
    );
  };

  /** Current pane: a real drop-target section. Neighbour panes: plain markup. */
  const paneSection = (kind: SidebarItemKind, items: SidebarItemRef[], cls: string, current: boolean, v?: SidebarView) =>
    current ? (
      section(
        kind,
        kind === 'pinned' && v
          ? renderPinnedContent(v, false)
          : items.map((i) => (kind === 'favorite' ? renderFavorite(i) : renderTabRow(i))),
        cls,
      )
    ) : (
      <div className={cls}>
        {kind === 'pinned' && v
          ? renderPinnedContent(v, true)
          : items.map((i) => (kind === 'favorite' ? renderFavorite(i, true) : renderTabRow(i, true)))}
      </div>
    );
  const renderPane = (id: string | undefined, slot: 'prev' | 'next' | 'current', v: SidebarView | null) => {
    if (!id || !v) return <div key={`empty-${slot}`} className="nsb-pane" aria-hidden="true" />;
    const current = slot === 'current';
    const showPinnedOrToday = v.pinned.length > 0 || v.today.length > 0 || (v.folders && v.folders.length > 0);
    return (
      <div
        key={id}
        className={`nsb-pane ${current ? 'current' : 'inert'}`}
        aria-hidden={current ? undefined : true}
        style={current ? undefined : { pointerEvents: 'none' }}
      >
        {favoritesInPanes && (current || v.favorites.length > 0) && paneSection('favorite', v.favorites, 'nsb-favorites', current)}
        {paneSection('pinned', v.pinned, 'nsb-list nsb-pinned', current, v)}
        {showPinnedOrToday && <div className="nsb-divider" role="separator" />}
        {paneSection('today', v.today, 'nsb-list nsb-today', current)}
      </div>
    );
  };
  const activeSpace = view.activeSpace;
  const activeProfile = view.activeProfile;
  const profileCount = view.groups.length;

  const rootClass = [
    'nsb',
    expanded ? 'expanded' : 'collapsed',
    drag.dragging ? 'dragging' : '',
    autoHide ? 'autohide' : '',
    visible ? 'visible' : 'hidden',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const spaceButton = (space: Space, profile: Profile) => {
    const active = space.id === activeSpaceId;
    const base = {
      type: 'button' as const,
      className: `nsb-space-btn ${active ? 'active' : ''}`,
      'data-space-id': space.id,
      'data-profile-id': profile.id,
      'aria-pressed': active,
      title: profileCount > 1 ? `${space.name} (${profile.name})` : space.name,
      'aria-label': `Space ${space.name}, profile ${profile.name}`,
      style: { '--nsb-btn-color': space.color } as React.CSSProperties,
      onClick: () => actions.selectSpace(space.id),
    };
    return (
      <button key={space.id} {...mergeProps(mergeProps(base, drag.spaceProps(space.id)), spaceProps?.(space))}>
        <SpaceIcon space={space} size={14} />
      </button>
    );
  };

  const menuSpaces = menu
    ? view.spaceOrder.filter((s) => menu.item.kind === 'favorite' || s.id !== menu.item.tab?.spaceId)
    : [];

  return (
    <>
      {autoHide && !visible && (
        <div
          className="nsb-edge-zone"
          aria-hidden="true"
          onMouseEnter={(e) => setPointerX(e.clientX)}
          onMouseMove={(e) => setPointerX(e.clientX)}
        />
      )}
      <aside
        ref={rootRef}
        className={rootClass}
        aria-label="Sidebar"
        aria-hidden={!visible}
        style={{
          '--nsb-width-expanded': `${sidebarWidth ?? 240}px`,
          '--nsb-space-color': activeSpace?.color ?? 'var(--theme-accent)',
        } as React.CSSProperties}
        onMouseEnter={() => setOverSidebar(true)}
        onMouseLeave={() => setOverSidebar(false)}
      >
        {expanded && (
          <div
            className={`nsb-resizer ${isResizing ? 'active' : ''}`}
            onMouseDown={handleResizeStart}
            title="Drag to resize tab holder"
            role="separator"
            aria-orientation="vertical"
          />
        )}
        {/* Active space: name, icon and color (R13.6) */}
        <div className="nsb-header">
          {activeSpace && (
            <div className="nsb-space-title" title={activeSpace.name}>
              <SpaceIcon space={activeSpace} size={15} />
              <span className="nsb-space-name">{activeSpace.name}</span>
              {activeProfile && profileCount > 1 && (
                <span className="nsb-profile-chip" title={`Profile: ${activeProfile.name}`}>
                  {activeProfile.name}
                </span>
              )}
            </div>
          )}
          <div className="nsb-header-actions">
            <button
              type="button"
              className="nsb-icon-btn"
              aria-pressed={autoHide}
              title={autoHide ? 'Keep sidebar visible' : 'Auto-hide sidebar'}
              aria-label={autoHide ? 'Keep sidebar visible' : 'Auto-hide sidebar'}
              onClick={() => onUpdateSidebarState({ sidebarAutoHide: !autoHide })}
            >
              {autoHide ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button
              type="button"
              className="nsb-icon-btn"
              aria-expanded={expanded}
              title={expanded ? 'Collapse sidebar (Ctrl+E)' : 'Expand sidebar (Ctrl+E)'}
              aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
              onClick={() => onUpdateSidebarState({ sidebarExpanded: !expanded })}
            >
              {expanded ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
            </button>
          </div>
        </div>

        {!favoritesInPanes && section('favorite', view.favorites.map((f) => renderFavorite(f)), 'nsb-favorites')}
        <div className="nsb-panes">
          <div className="nsb-track" ref={trackRef}>
            {renderPane(prevId, 'prev', prevView)}
            {renderPane(activeSpaceId, 'current', view)}
            {renderPane(nextId, 'next', nextView)}
          </div>
        </div>
        {/* Space_Switcher: one row of icons, profile groups separated by a divider (R13.1) */}
        <nav className="nsb-switcher" aria-label="Spaces">
          {view.groups.map(({ profile, spaces }) =>
            spaces.length === 0 ? null : (
              <div key={profile.id} className="nsb-switcher-group" data-profile-id={profile.id}>
                {spaces.map((s) => spaceButton(s, profile))}
              </div>
            ),
          )}
        </nav>
        {children}
      </aside>

      {preview.state && !drag.dragging && (
        <TabPreviewCard
          preview={preview.state}
          onMouseEnter={preview.cardProps.onMouseEnter}
          onMouseLeave={preview.cardProps.onMouseLeave}
        />
      )}

      {drag.ghost && (
        <div
          ref={drag.ghostRef}
          className={`nsb-drag-ghost ${drag.ghost.item.kind === 'favorite' ? 'tile' : ''}`}
          aria-hidden="true"
          style={{ transform: `translate(${drag.ghost.x + 12}px, ${drag.ghost.y + 8}px)` }}
        >
          <Favicon src={drag.ghost.item.favicon ?? drag.ghost.item.tab?.favicon} />
          {drag.ghost.item.kind !== 'favorite' && (
            <span className="nsb-tab-title">{drag.ghost.item.title || drag.ghost.item.url || 'New Tab'}</span>
          )}
        </div>
      )}

      {menu && (
        <div
          className="nsb-menu"
          role="menu"
          style={{ left: menu.x, top: menu.y, width: MENU_WIDTH }}
          onMouseDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {menu.showFolders ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="nsb-menu-item nsb-menu-back"
                onClick={() => setMenu((m) => (m ? { ...m, showFolders: false } : m))}
              >
                <span>‹ Move to folder</span>
              </button>
              {menu.item.folderId && (
                <button
                  type="button"
                  role="menuitem"
                  className="nsb-menu-item"
                  onClick={() => {
                    actions.moveTabToFolder?.(menu.item.id, null);
                    setMenu(null);
                  }}
                >
                  <Pin size={13} />
                  <span>No folder (Root)</span>
                </button>
              )}
              {view.folders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="menuitem"
                  className="nsb-menu-item"
                  disabled={f.id === menu.item.folderId}
                  onClick={() => {
                    actions.moveTabToFolder?.(menu.item.id, f.id);
                    setMenu(null);
                  }}
                >
                  <Folder size={13} />
                  <span>{f.name}</span>
                </button>
              ))}
              <button
                type="button"
                role="menuitem"
                className="nsb-menu-item"
                onClick={() => {
                  const name = prompt('New folder name:', 'New Folder');
                  if (name && name.trim()) {
                    const res: any = actions.createFolder?.(activeSpaceId, name.trim());
                    Promise.resolve(res).then((r: any) => {
                      const createdId = r?.folder?.id || r?.id;
                      if (createdId) {
                        actions.moveTabToFolder?.(menu.item.id, createdId);
                      }
                    });
                  }
                  setMenu(null);
                }}
              >
                <FolderPlus size={13} />
                <span>+ New Folder with Tab</span>
              </button>
            </>
          ) : !menu.showSpaces ? (
            contextMenuActions(menu.item, { hasFolders: view.folders.length > 0 || menu.item.kind === 'pinned' }).map((action) => {
              const Icon = MENU_ICONS[action];
              return (
                <button
                  key={action}
                  type="button"
                  role="menuitem"
                  className={`nsb-menu-item ${action === 'close' ? 'danger' : ''}`}
                  disabled={action === 'move-to-space' && menuSpaces.length === 0}
                  onClick={() => runMenuAction(menu.item, action)}
                >
                  <Icon size={13} />
                  <span>{MENU_LABELS[action]}</span>
                  {(action === 'move-to-space' || action === 'move-to-folder') && <span className="nsb-menu-more">›</span>}
                </button>
              );
            })
          ) : (
            <>
              <button
                type="button"
                role="menuitem"
                className="nsb-menu-item nsb-menu-back"
                onClick={() => setMenu((m) => (m ? { ...m, showSpaces: false } : m))}
              >
                <span>‹ Move to space</span>
              </button>
              {view.groups.map(({ profile, spaces }) =>
                spaces
                  .filter((s) => menuSpaces.includes(s))
                  .map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      role="menuitem"
                      className="nsb-menu-item"
                      onClick={() => {
                        actions.moveTab(moveToSpaceOp(menu.item, s.id));
                        setMenu(null);
                      }}
                    >
                      <SpaceIcon space={s} size={13} />
                      <span>{s.name}</span>
                      {profileCount > 1 && <span className="nsb-menu-hint">{profile.name}</span>}
                    </button>
                  )),
              )}
            </>
          )}
        </div>
      )}

      {folderMenu && (
        <div
          className="nsb-menu"
          role="menu"
          style={{ left: folderMenu.x, top: folderMenu.y, width: MENU_WIDTH }}
          onMouseDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            type="button"
            role="menuitem"
            className="nsb-menu-item"
            onClick={() => {
              const tabPromise = actions.createTab('neutrino://newtab', activeSpaceId);
              Promise.resolve(tabPromise).then((newTab: any) => {
                if (newTab?.id) {
                  actions.moveTabToFolder?.(newTab.id, folderMenu.folder.id);
                }
              });
              setFolderMenu(null);
            }}
          >
            <Plus size={13} />
            <span>New Tab Inside</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="nsb-menu-item"
            onClick={() => {
              setRenamingFolderId(folderMenu.folder.id);
              setRenameValue(folderMenu.folder.name);
              setFolderMenu(null);
            }}
          >
            <Edit2 size={13} />
            <span>Rename Folder</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="nsb-menu-item danger"
            onClick={() => {
              actions.deleteFolder?.(folderMenu.folder.id);
              setFolderMenu(null);
            }}
          >
            <Trash2 size={13} />
            <span>Delete Folder</span>
          </button>
        </div>
      )}
    </>
  );
};

export default Sidebar;
