// Task 12.12: save/update password prompt queue and markup.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  addPrompt,
  applyResponse,
  closeNeedsDismiss,
  markBusy,
  promptButtons,
  removePrompt,
  sanitizePromptInfo,
  visiblePrompt,
  type PromptQueue,
} from '../../../src/renderer/utils/passwordPrompts';
import { PasswordPromptView } from '../../../src/renderer/components/PasswordPrompt';
import type { PromptInfo } from '../../../src/renderer/types';

const info = (promptId: string, webContentsId: number, kind: 'save' | 'update' = 'save'): PromptInfo => ({
  promptId,
  kind,
  profileId: 'p1',
  webContentsId,
  origin: 'https://example.com',
  username: 'alice',
});

describe('prompt queue', () => {
  it('shows the newest prompt first and removes prompts by id', () => {
    let q: PromptQueue = [];
    q = addPrompt(q, info('a', 1));
    q = addPrompt(q, info('b', 2));
    expect(visiblePrompt(q)?.info.promptId).toBe('b');
    expect(q.map((e) => e.info.promptId)).toEqual(['b', 'a']);
    q = removePrompt(q, 'b');
    expect(visiblePrompt(q)?.info.promptId).toBe('a');
    q = removePrompt(q, 'a');
    expect(visiblePrompt(q)).toBeNull();
  });

  it('replaces an unanswered prompt from the same tab and ignores duplicates', () => {
    let q = addPrompt([], info('a', 1));
    q = addPrompt(q, info('b', 1));
    expect(q.map((e) => e.info.promptId)).toEqual(['b']);
    q = addPrompt(q, info('b', 1));
    expect(q).toHaveLength(1);
  });

  it('keeps an error entry when the same tab prompts again', () => {
    let q = addPrompt([], info('a', 1));
    q = applyResponse(q, 'a', { ok: false, error: 'encryption-unavailable', message: 'x' });
    q = addPrompt(q, info('b', 1));
    expect(q.map((e) => e.info.promptId)).toEqual(['b', 'a']);
  });

  it('ignores malformed payloads and keeps no extra fields such as a password', () => {
    expect(addPrompt([], { promptId: 'a' })).toEqual([]);
    expect(sanitizePromptInfo(null)).toBeNull();
    const clean = sanitizePromptInfo({ ...info('a', 1), password: 'hunter2' });
    expect(clean).toEqual(info('a', 1));
    expect(JSON.stringify(addPrompt([], { ...info('a', 1), password: 'hunter2' }))).not.toContain('hunter2');
  });

  it('removes on success and keeps the prompt with the message on failure (R7.2)', () => {
    let q = markBusy(addPrompt([], info('a', 1)), 'a');
    expect(q[0].status).toBe('busy');
    expect(applyResponse(q, 'a', { ok: true })).toEqual([]);
    q = applyResponse(q, 'a', { ok: false, error: 'encryption-unavailable', message: 'from main' });
    expect(q[0].status).toBe('error');
    expect(q[0].message).toBe('Passwords cannot be saved because system encryption is unavailable.');
    const corrupt = applyResponse(addPrompt([], info('c', 2)), 'c', { ok: false, error: 'vault-corrupt', message: 'm' });
    expect(corrupt[0].message).toMatch(/vault file is unreadable/);
    expect(applyResponse(addPrompt([], info('d', 3)), 'd', undefined)[0].status).toBe('error');
  });

  it('sends dismiss on close unless main already dropped the capture', () => {
    const q = addPrompt([], info('a', 1));
    expect(closeNeedsDismiss(q[0])).toBe(true);
    expect(closeNeedsDismiss(applyResponse(q, 'a', { ok: false, error: 'encryption-unavailable' })[0])).toBe(false);
    expect(closeNeedsDismiss(applyResponse(q, 'a', { ok: false, error: 'invalid-action' })[0])).toBe(true);
  });
});

describe('prompt buttons (R6.2, R6.3)', () => {
  it('offers Save / Never for this site / Not now for a save prompt', () => {
    const b = promptButtons(info('a', 1, 'save'));
    expect(b.map((x) => [x.action, x.label])).toEqual([
      ['save', 'Save'],
      ['never', 'Never for this site'],
      ['not-now', 'Not now'],
    ]);
    expect(b.every((x) => x.ariaLabel.length > 0)).toBe(true);
  });

  it('offers Update / Not now for an update prompt', () => {
    expect(promptButtons(info('a', 1, 'update')).map((x) => x.label)).toEqual(['Update', 'Not now']);
  });
});

describe('PasswordPromptView markup', () => {
  const render = (entry: Parameters<typeof PasswordPromptView>[0]['entry'], pendingCount = 0) =>
    renderToStaticMarkup(
      createElement(PasswordPromptView, { entry, pendingCount, onAction: () => {}, onClose: () => {} }),
    );

  it('shows origin and username with labelled buttons', () => {
    const html = render({ info: info('a', 1), status: 'idle' }, 2);
    expect(html).toContain('example.com');
    expect(html).toContain('alice');
    expect(html).toContain('Never for this site');
    expect(html).toContain('2 more prompts waiting');
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    expect(buttons.length).toBe(4);
    expect(buttons.every((b) => /aria-label="[^"]+"/.test(b))).toBe(true);
  });

  it('shows the encryption-unavailable message instead of the actions', () => {
    const [entry] = applyResponse(addPrompt([], info('a', 1)), 'a', { ok: false, error: 'encryption-unavailable' });
    const html = render(entry);
    expect(html).toContain('system encryption is unavailable');
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('>Save<');
  });
});
