import React, { useEffect, useRef } from 'react';
import { ChevronUp, ChevronDown, X, Search } from 'lucide-react';

export interface FindBarProps {
  isOpen: boolean;
  query: string;
  activeMatch: number;
  totalMatches: number;
  onQueryChange: (query: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

export const FindBar: React.FC<FindBarProps> = ({
  isOpen,
  query,
  activeMatch,
  totalMatches,
  onQueryChange,
  onNext,
  onPrev,
  onClose,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const id = window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 10);
      return () => window.clearTimeout(id);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const hasQuery = query.length > 0;
  const countText = !hasQuery
    ? ''
    : totalMatches > 0
      ? `${activeMatch}/${totalMatches}`
      : '0/0';

  return (
    <div
      className="find-bar-floating glass-surface"
      role="dialog"
      aria-label="Find in page"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Search size={13} className="find-bar-icon" aria-hidden="true" />
      <input
        ref={inputRef}
        type="text"
        className="find-bar-input"
        placeholder="Find in page..."
        aria-label="Find in page"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            if (e.shiftKey) onPrev();
            else onNext();
          }
        }}
      />
      {hasQuery && (
        <span
          className={`find-bar-count ${totalMatches === 0 ? 'empty' : ''}`}
          aria-live="polite"
        >
          {countText}
        </span>
      )}
      <div className="find-bar-actions">
        <button
          type="button"
          className="find-bar-btn"
          aria-label="Previous match"
          title="Previous match (Shift+Enter)"
          disabled={!hasQuery || totalMatches === 0}
          onClick={onPrev}
        >
          <ChevronUp size={14} />
        </button>
        <button
          type="button"
          className="find-bar-btn"
          aria-label="Next match"
          title="Next match (Enter)"
          disabled={!hasQuery || totalMatches === 0}
          onClick={onNext}
        >
          <ChevronDown size={14} />
        </button>
        <button
          type="button"
          className="find-bar-btn close"
          aria-label="Close find bar"
          title="Close (Esc)"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

