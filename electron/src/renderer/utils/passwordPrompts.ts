// Save/update password prompt queue (task 12.12, R6.2, R6.3, R6.5–6.7, R7.2).
//
// Pure helpers for PasswordPrompt.tsx. The queue is ordered newest first and the
// head is the visible prompt. Entries keep origin and username only (bugfix 2.12):
// `addPrompt` copies the known PromptInfo fields, so nothing else from the IPC
// payload is retained in renderer state.
import type { PromptAction, PromptInfo } from '../types';
import { describePasswordError, displayOrigin } from './passwordSettings';

export type PromptStatus = 'idle' | 'busy' | 'error';

export interface PromptEntry {
  readonly info: PromptInfo;
  readonly status: PromptStatus;
  /** Error code from main, set when status is 'error'. */
  readonly errorCode?: string;
  /** Message shown to the user, set when status is 'error'. */
  readonly message?: string;
}

export type PromptQueue = readonly PromptEntry[];

/** Copy only the fields the UI needs from an IPC payload; null when malformed. */
export function sanitizePromptInfo(raw: unknown): PromptInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.promptId !== 'string' || !r.promptId) return null;
  if (r.kind !== 'save' && r.kind !== 'update') return null;
  if (typeof r.origin !== 'string' || typeof r.username !== 'string') return null;
  return {
    promptId: r.promptId,
    kind: r.kind,
    profileId: typeof r.profileId === 'string' ? r.profileId : '',
    webContentsId: typeof r.webContentsId === 'number' ? r.webContentsId : -1,
    origin: r.origin,
    username: r.username,
  };
}

/**
 * Put a new prompt at the front. A prompt with the same id is replaced, and an
 * unanswered prompt from the same tab is dropped (main keeps one capture per
 * tab and has already discarded the older one). Error entries stay so the user
 * still sees why a save failed.
 */
export function addPrompt(queue: PromptQueue, raw: unknown): PromptQueue {
  const info = sanitizePromptInfo(raw);
  if (!info) return queue;
  const rest = queue.filter(
    (e) =>
      e.info.promptId !== info.promptId &&
      !(e.status !== 'error' && info.webContentsId >= 0 && e.info.webContentsId === info.webContentsId),
  );
  return [{ info, status: 'idle' }, ...rest];
}

/** Remove a prompt (closed by main, answered, or dismissed). */
export function removePrompt(queue: PromptQueue, promptId: string): PromptQueue {
  return queue.some((e) => e.info.promptId === promptId) ? queue.filter((e) => e.info.promptId !== promptId) : queue;
}

/** The prompt to show, or null. */
export function visiblePrompt(queue: PromptQueue): PromptEntry | null {
  return queue[0] ?? null;
}

function update(queue: PromptQueue, promptId: string, fn: (e: PromptEntry) => PromptEntry): PromptQueue {
  let changed = false;
  const next = queue.map((e) => {
    if (e.info.promptId !== promptId) return e;
    changed = true;
    return fn(e);
  });
  return changed ? next : queue;
}

/** Mark a prompt as waiting for main's answer (buttons disabled). */
export function markBusy(queue: PromptQueue, promptId: string): PromptQueue {
  return update(queue, promptId, (e) => ({ info: e.info, status: 'busy' }));
}

export interface PromptResponse {
  ok: boolean;
  error?: string;
  message?: string;
}

/**
 * Apply main's answer: success removes the prompt; a failure (for example
 * encryption-unavailable or vault-corrupt, R7.2) keeps it with the message.
 * A missing response (IPC unavailable) is treated as an error.
 */
export function applyResponse(
  queue: PromptQueue,
  promptId: string,
  response: PromptResponse | null | undefined,
): PromptQueue {
  if (response?.ok) return removePrompt(queue, promptId);
  const code = response?.error ?? 'unavailable';
  const message = describePasswordError(code, response?.message);
  return update(queue, promptId, (e) => ({ info: e.info, status: 'error', errorCode: code, message }));
}

/**
 * Whether closing this entry must tell main to drop the capture. Main drops the
 * capture on every resolved outcome except 'invalid-action', so error entries
 * need no further response unless that was the error.
 */
export function closeNeedsDismiss(entry: PromptEntry): boolean {
  return entry.status !== 'error' || entry.errorCode === 'invalid-action';
}

export interface PromptButton {
  action: Exclude<PromptAction, 'dismiss'>;
  label: string;
  ariaLabel: string;
  primary: boolean;
}

/** Buttons for a prompt: save → Save / Never for this site / Not now; update → Update / Not now. */
export function promptButtons(info: Pick<PromptInfo, 'kind' | 'origin' | 'username'>): PromptButton[] {
  const site = displayOrigin(info.origin);
  const who = info.username ? ` for ${info.username}` : '';
  if (info.kind === 'update') {
    return [
      { action: 'update', label: 'Update', ariaLabel: `Update saved password${who} on ${site}`, primary: true },
      { action: 'not-now', label: 'Not now', ariaLabel: 'Not now, keep the saved password', primary: false },
    ];
  }
  return [
    { action: 'save', label: 'Save', ariaLabel: `Save password${who} on ${site}`, primary: true },
    { action: 'never', label: 'Never for this site', ariaLabel: `Never save passwords on ${site}`, primary: false },
    { action: 'not-now', label: 'Not now', ariaLabel: 'Not now, do not save this password', primary: false },
  ];
}

/** Prompt heading. */
export function promptTitle(info: Pick<PromptInfo, 'kind'>): string {
  return info.kind === 'update' ? 'Update saved password?' : 'Save password?';
}
