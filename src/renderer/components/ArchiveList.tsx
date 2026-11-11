import React, { useCallback, useEffect, useState } from 'react';
import { Archive, Globe, RotateCcw, X } from 'lucide-react';
import type { ArchiveListEntry } from '../types';

// Archive list of the Active_Profile (R16.7, R16.8). Reuses the history modal
// styles. `ArchiveListView` is presentational; `ArchiveList` loads the entries
// over IPC and follows `archive-updated`.

/** Newest first (R16.7); ties by id, matching the main process order. */
export function sortArchiveEntries(entries: readonly ArchiveListEntry[]): ArchiveListEntry[] {
  return [...entries].sort((a, b) => b.archivedAt - a.archivedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function formatArchivedAt(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

const ArchiveFavicon: React.FC<{ src?: string }> = ({ src }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <Globe size={13} style={{ opacity: 0.72 }} />;
  return <img src={src} alt="" className="history-favicon-img" onError={() => setFailed(true)} />;
};

export interface ArchiveListViewProps {
  isOpen: boolean;
  onClose: () => void;
  entries: readonly ArchiveListEntry[];
  onRestore: (entry: ArchiveListEntry) => void;
  /** Id of an entry being restored; its button is disabled. */
  restoringId?: string | null;
}

export const ArchiveListView: React.FC<ArchiveListViewProps> = ({ isOpen, onClose, entries, onRestore, restoringId }) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const sorted = sortArchiveEntries(entries);

  return (
    <div
      className="modal-overlay history-modal-overlay archive-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Archived tabs"
    >
      <div className="modal-content-card history-modal-card archive-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Archive size={18} />
            <span>Archive</span>
            <span className="history-count-badge">{entries.length}</span>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close archive" title="Close (Esc)">
            <X size={16} />
          </button>
        </div>

        <div className="history-list-scroll">
          {sorted.length === 0 ? (
            <div className="history-empty-state">
              <Archive size={24} style={{ opacity: 0.45 }} />
              <div style={{ fontWeight: 600, fontSize: '13px' }}>No archived tabs</div>
              <div style={{ fontSize: '11.5px', opacity: 0.7 }}>
                Today tabs left unused past the archive interval appear here for 30 days.
              </div>
            </div>
          ) : (
            sorted.map((entry) => (
              <div key={entry.id} className="history-row archive-row" title={entry.url}>
                <div className="history-favicon-wrap">
                  <ArchiveFavicon src={entry.favicon} />
                </div>
                <div className="history-row-main">
                  <div className="history-row-title archive-row-title">{entry.title || entry.url}</div>
                  <div className="history-row-meta">
                    <span className="history-row-url archive-row-url">{entry.url}</span>
                    <span className="history-visit-pill archive-row-space">{entry.spaceName ?? 'Deleted space'}</span>
                  </div>
                </div>
                <time className="history-row-time archive-row-time" dateTime={new Date(entry.archivedAt).toISOString()}>
                  {formatArchivedAt(entry.archivedAt)}
                </time>
                <div className="history-row-actions">
                  <button
                    type="button"
                    className="history-row-action-btn archive-restore-btn"
                    title="Restore tab"
                    aria-label={`Restore ${entry.title || entry.url}`}
                    disabled={restoringId === entry.id}
                    onClick={() => onRestore(entry)}
                  >
                    <RotateCcw size={13} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export interface ArchiveListProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Loads the Active_Profile's archive when opened and restores entries over IPC. */
export const ArchiveList: React.FC<ArchiveListProps> = ({ isOpen, onClose }) => {
  const [entries, setEntries] = useState<ArchiveListEntry[]>([]);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const api = window.neutrino;
    let cancelled = false;
    void api?.listArchive?.().then((list) => {
      if (!cancelled && Array.isArray(list)) setEntries(list);
    });
    const off = api?.onArchiveUpdated?.((list) => {
      if (Array.isArray(list)) setEntries(list);
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, [isOpen]);

  const handleRestore = useCallback(async (entry: ArchiveListEntry) => {
    const api = window.neutrino;
    if (!api?.restoreArchivedTab) return;
    setRestoringId(entry.id);
    try {
      const result = await api.restoreArchivedTab(entry.id);
      if (result.ok) setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    } finally {
      setRestoringId(null);
    }
  }, []);

  return (
    <ArchiveListView
      isOpen={isOpen}
      onClose={onClose}
      entries={entries}
      onRestore={(entry) => void handleRestore(entry)}
      restoringId={restoringId}
    />
  );
};

export default ArchiveList;
