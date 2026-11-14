import React, { useEffect, useMemo, useState } from 'react';
import { History, Search, Trash2, X, Globe, ExternalLink, Clock } from 'lucide-react';
import type { HistoryClearRange, HistoryEntry } from '../types';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: HistoryEntry[];
  onOpenUrl: (url: string, options?: { newTab?: boolean }) => void;
  onDeleteEntry: (entry: HistoryEntry) => void;
  onClearHistory: (range: HistoryClearRange) => void;
}

type DateBucket = 'Today' | 'Yesterday' | 'Earlier';

function getDateBucket(timestamp: number, now = new Date()): DateBucket {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  if (timestamp >= startOfToday) return 'Today';
  if (timestamp >= startOfYesterday) return 'Yesterday';
  return 'Earlier';
}

function formatEntryTime(timestamp: number, bucket: DateBucket): string {
  const d = new Date(timestamp);
  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (bucket === 'Earlier') {
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${timeStr}`;
  }
  return timeStr;
}

function formatHost(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./i, '') + (u.pathname !== '/' ? u.pathname : '');
  } catch {
    return url;
  }
}

const HistoryFavicon: React.FC<{ src?: string }> = ({ src }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);
  if (!src || failed) {
    return <Globe size={13} style={{ opacity: 0.72 }} />;
  }
  return (
    <img
      src={src}
      alt=""
      className="history-favicon-img"
      onError={() => setFailed(true)}
    />
  );
};

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  onClose,
  entries,
  onOpenUrl,
  onDeleteEntry,
  onClearHistory,
}) => {
  const [query, setQuery] = useState('');
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setConfirmClearAll(false);
    }
  }, [isOpen]);

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    const terms = q.split(/\s+/).filter(Boolean);
    return entries.filter((entry) => {
      const hay = `${entry.title}\n${entry.url}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [entries, query]);

  const grouped = useMemo(() => {
    const buckets: Record<DateBucket, HistoryEntry[]> = {
      Today: [],
      Yesterday: [],
      Earlier: [],
    };
    const now = new Date();
    for (const entry of filtered) {
      buckets[getDateBucket(entry.timestamp, now)].push(entry);
    }
    return buckets;
  }, [filtered]);

  if (!isOpen) return null;

  const bucketOrder: DateBucket[] = ['Today', 'Yesterday', 'Earlier'];

  return (
    <div
      className="modal-overlay history-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Browsing History"
    >
      <div
        className="modal-content-card history-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title">
            <History size={18} />
            <span>History</span>
            <span className="history-count-badge">{entries.length}</span>
          </div>
          <button
            className="close-btn"
            onClick={onClose}
            aria-label="Close history"
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search Input */}
        <div className="history-search-row">
          <div className="history-search-box">
            <Search size={14} className="history-search-icon" />
            <input
              type="text"
              className="history-search-input"
              placeholder="Search pages, domains, or titles..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              aria-label="Search browsing history"
            />
            {query && (
              <button
                type="button"
                className="history-search-clear"
                onClick={() => setQuery('')}
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Clear controls */}
        <div className="history-actions-bar">
          <button
            type="button"
            className="history-clear-chip"
            disabled={entries.length === 0}
            onClick={() => onClearHistory('hour')}
          >
            Clear last hour
          </button>
          <button
            type="button"
            className="history-clear-chip"
            disabled={entries.length === 0}
            onClick={() => onClearHistory('day')}
          >
            Clear last 24h
          </button>
          {confirmClearAll ? (
            <button
              type="button"
              className="history-clear-chip danger confirm"
              onClick={() => {
                onClearHistory('all');
                setConfirmClearAll(false);
              }}
            >
              Confirm clear all
            </button>
          ) : (
            <button
              type="button"
              className="history-clear-chip danger"
              disabled={entries.length === 0}
              onClick={() => setConfirmClearAll(true)}
            >
              Clear all
            </button>
          )}
        </div>

        {/* Timeline List */}
        <div className="history-list-scroll">
          {filtered.length === 0 ? (
            <div className="history-empty-state">
              <Clock size={24} style={{ opacity: 0.45 }} />
              <div style={{ fontWeight: 600, fontSize: '13px' }}>
                {entries.length === 0 ? 'No browsing history yet' : 'No matching pages found'}
              </div>
              <div style={{ fontSize: '11.5px', opacity: 0.7 }}>
                {entries.length === 0
                  ? 'Websites you visit will be saved locally here.'
                  : 'Try another keyword or clear your search filter.'}
              </div>
            </div>
          ) : (
            bucketOrder.map((bucket) => {
              const list = grouped[bucket];
              if (list.length === 0) return null;
              return (
                <div key={bucket} className="history-bucket">
                  <div className="history-bucket-header">{bucket}</div>
                  {list.map((entry) => (
                    <div
                      key={entry.id}
                      className="history-row"
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        onOpenUrl(entry.url, { newTab: false });
                        onClose();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onOpenUrl(entry.url, { newTab: false });
                          onClose();
                        }
                      }}
                      title={entry.url}
                    >
                      <div className="history-favicon-wrap">
                        <HistoryFavicon src={entry.favicon} />
                      </div>
                      <div className="history-row-main">
                        <div className="history-row-title">{entry.title || entry.url}</div>
                        <div className="history-row-meta">
                          <span className="history-row-url">{formatHost(entry.url)}</span>
                          {entry.visitCount > 1 && (
                            <span className="history-visit-pill">{entry.visitCount}x</span>
                          )}
                        </div>
                      </div>
                      <span className="history-row-time">
                        {formatEntryTime(entry.timestamp, bucket)}
                      </span>
                      <div className="history-row-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="history-row-action-btn"
                          title="Open in new tab"
                          aria-label={`Open ${entry.title} in new tab`}
                          onClick={() => {
                            onOpenUrl(entry.url, { newTab: true });
                            onClose();
                          }}
                        >
                          <ExternalLink size={13} />
                        </button>
                        <button
                          type="button"
                          className="history-row-action-btn delete"
                          title="Delete from history"
                          aria-label={`Delete ${entry.title} from history`}
                          onClick={() => onDeleteEntry(entry)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

