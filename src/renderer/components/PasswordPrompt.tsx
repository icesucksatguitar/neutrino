import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import type { PromptAction } from '../types';
import {
  addPrompt,
  applyResponse,
  closeNeedsDismiss,
  markBusy,
  promptButtons,
  promptTitle,
  removePrompt,
  visiblePrompt,
  type PromptEntry,
  type PromptQueue,
} from '../utils/passwordPrompts';
import { displayOrigin } from '../utils/passwordSettings';

export interface PasswordPromptViewProps {
  entry: PromptEntry;
  /** Prompts waiting behind this one. */
  pendingCount: number;
  onAction: (action: Exclude<PromptAction, 'dismiss'>) => void;
  onClose: () => void;
}

/** Presentational prompt: origin, username, the action buttons and any error (R6.2, R6.3, R7.2). */
export const PasswordPromptView: React.FC<PasswordPromptViewProps> = ({ entry, pendingCount, onAction, onClose }) => {
  const { info, status, message } = entry;
  const titleId = `password-prompt-title-${info.promptId}`;
  const busy = status === 'busy';
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <div className="password-prompt" role="dialog" aria-modal="false" aria-labelledby={titleId} onKeyDown={onKeyDown}>
      <KeyRound size={16} className="password-prompt-icon" aria-hidden="true" />
      <div className="password-prompt-body">
        <p className="password-prompt-title" id={titleId}>
          {promptTitle(info)}
        </p>
        <p className="password-prompt-site">{displayOrigin(info.origin)}</p>
        <p className="password-prompt-user">{info.username || 'No username'}</p>
        {status === 'error' && (
          <p className="password-prompt-error" role="alert">
            {message}
          </p>
        )}
        {pendingCount > 0 && (
          <p className="password-prompt-more">
            {pendingCount} more {pendingCount === 1 ? 'prompt' : 'prompts'} waiting
          </p>
        )}
        <div className="password-prompt-actions">
          {status !== 'error' &&
            promptButtons(info).map((b) => (
              <button
                key={b.action}
                type="button"
                className={b.primary ? 'password-prompt-primary' : 'password-prompt-secondary'}
                aria-label={b.ariaLabel}
                disabled={busy}
                onClick={() => onAction(b.action)}
              >
                {b.label}
              </button>
            ))}
          {status === 'error' && (
            <button type="button" className="password-prompt-secondary" aria-label="Close password prompt" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>
      <button
        type="button"
        className="password-prompt-close"
        aria-label="Dismiss password prompt"
        title="Dismiss"
        disabled={busy}
        onClick={onClose}
      >
        <X size={14} />
      </button>
    </div>
  );
};

/**
 * Save/update password prompts driven by main-process events. Newest prompt is
 * shown first; a prompt closes when answered, dismissed, or when main sends
 * `password-prompt-closed` (tab closed, navigated, replaced or expired).
 */
export const PasswordPrompt: React.FC = () => {
  const [queue, setQueue] = useState<PromptQueue>([]);

  useEffect(() => {
    const api = window.neutrino;
    const offPrompt = api?.onPasswordPrompt?.((prompt) => setQueue((q) => addPrompt(q, prompt)));
    const offClosed = api?.onPasswordPromptClosed?.((payload) => {
      if (payload && typeof payload.promptId === 'string') setQueue((q) => removePrompt(q, payload.promptId));
    });
    return () => {
      offPrompt?.();
      offClosed?.();
    };
  }, []);

  const entry = visiblePrompt(queue);

  const respond = useCallback(async (promptId: string, action: Exclude<PromptAction, 'dismiss'>) => {
    setQueue((q) => markBusy(q, promptId));
    let result;
    try {
      result = await window.neutrino?.respondToPasswordPrompt?.(promptId, action);
    } catch {
      result = undefined;
    }
    setQueue((q) => applyResponse(q, promptId, result));
  }, []);

  const close = useCallback((target: PromptEntry) => {
    const { promptId } = target.info;
    if (closeNeedsDismiss(target)) {
      // Main drops the in-memory capture (R6.10); nothing to show on failure.
      void window.neutrino?.respondToPasswordPrompt?.(promptId, 'dismiss')?.catch?.(() => {});
    }
    setQueue((q) => removePrompt(q, promptId));
  }, []);

  if (!entry) return null;
  return (
    <PasswordPromptView
      entry={entry}
      pendingCount={queue.length - 1}
      onAction={(action) => void respond(entry.info.promptId, action)}
      onClose={() => close(entry)}
    />
  );
};
