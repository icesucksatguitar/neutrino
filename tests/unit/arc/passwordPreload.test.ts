import { describe, it, expect } from 'vitest';
import {
  isHttpOrigin,
  pickUsernameIndex,
  pickCapturePasswordIndex,
  isSubmitLike,
  shouldSendCapture,
  CAPTURE_DEDUPE_MS,
  type FieldInfo,
  type ButtonInfo,
} from '../../../src/main/passwords/passwordPreload';

function f(type: string, over: Partial<FieldInfo> = {}): FieldInfo {
  return { type, autocomplete: '', visible: true, hasValue: false, ...over };
}

function btn(over: Partial<ButtonInfo>): ButtonInfo {
  return { tag: 'button', type: '', role: '', label: '', inForm: false, ...over };
}

describe('isHttpOrigin', () => {
  it('accepts http and https origins', () => {
    expect(isHttpOrigin('https://example.com')).toBe(true);
    expect(isHttpOrigin('http://localhost:8080')).toBe(true);
  });
  it('rejects opaque, non-web and malformed origins', () => {
    for (const o of ['null', '', 'file://', 'about:blank', 'chrome-extension://abc', 'data:text/html,x', 'nope']) {
      expect(isHttpOrigin(o)).toBe(false);
    }
  });
});

describe('pickUsernameIndex', () => {
  it('picks the nearest visible text/email field before the password field', () => {
    const fields = [f('text'), f('email'), f('password')];
    expect(pickUsernameIndex(fields, 2)).toBe(1);
  });
  it('treats a missing type as text', () => {
    expect(pickUsernameIndex([f(''), f('password')], 1)).toBe(0);
  });
  it('prefers autocomplete=username, even when hidden or after the password', () => {
    const fields = [f('text'), f('password'), f('hidden', { autocomplete: 'username', visible: false })];
    expect(pickUsernameIndex(fields, 1)).toBe(2);
  });
  it('skips invisible fields when a visible candidate exists', () => {
    const fields = [f('text'), f('text', { visible: false }), f('password')];
    expect(pickUsernameIndex(fields, 2)).toBe(0);
  });
  it('falls back to an invisible candidate but never a hidden input', () => {
    expect(pickUsernameIndex([f('text', { visible: false }), f('password')], 1)).toBe(0);
    expect(pickUsernameIndex([f('hidden', { visible: false }), f('password')], 1)).toBe(-1);
  });
  it('ignores one-time-code fields, checkboxes and fields before a previous password', () => {
    expect(pickUsernameIndex([f('text', { autocomplete: 'one-time-code' }), f('password')], 1)).toBe(-1);
    expect(pickUsernameIndex([f('text'), f('checkbox'), f('password')], 2)).toBe(0);
    expect(pickUsernameIndex([f('text'), f('password'), f('password')], 2)).toBe(-1);
  });
  it('returns -1 for an out-of-range password index', () => {
    expect(pickUsernameIndex([f('text')], 3)).toBe(-1);
    expect(pickUsernameIndex([], -1)).toBe(-1);
  });
});

describe('pickCapturePasswordIndex', () => {
  it('returns the first password field with a value', () => {
    const fields = [f('text', { hasValue: true }), f('password'), f('password', { hasValue: true })];
    expect(pickCapturePasswordIndex(fields)).toBe(2);
  });
  it('prefers a new-password field with a value', () => {
    const fields = [
      f('password', { hasValue: true, autocomplete: 'current-password' }),
      f('password', { hasValue: true, autocomplete: 'new-password' }),
    ];
    expect(pickCapturePasswordIndex(fields)).toBe(1);
  });
  it('returns -1 when no password field has a value', () => {
    expect(pickCapturePasswordIndex([f('text', { hasValue: true }), f('password')])).toBe(-1);
  });
});

describe('isSubmitLike', () => {
  it('accepts submit inputs and submit buttons', () => {
    expect(isSubmitLike(btn({ tag: 'input', type: 'submit' }))).toBe(true);
    expect(isSubmitLike(btn({ type: 'submit' }))).toBe(true);
    expect(isSubmitLike(btn({ inForm: true }))).toBe(true);
  });
  it('accepts formless buttons and role=button elements labelled like a login', () => {
    expect(isSubmitLike(btn({ type: 'button', label: 'Sign in' }))).toBe(true);
    expect(isSubmitLike(btn({ tag: 'div', role: 'button', label: 'Log in' }))).toBe(true);
  });
  it('rejects reset buttons, unrelated labels and plain elements', () => {
    expect(isSubmitLike(btn({ type: 'reset', label: 'Sign in', inForm: true }))).toBe(false);
    expect(isSubmitLike(btn({ type: 'button', label: 'Show password' }))).toBe(false);
    expect(isSubmitLike(btn({ tag: 'input', type: 'checkbox' }))).toBe(false);
    expect(isSubmitLike(btn({ tag: 'div', label: 'Sign in' }))).toBe(false);
  });
});

describe('shouldSendCapture', () => {
  it('drops the same capture within the dedupe window only', () => {
    expect(shouldSendCapture(null, 'k', 0)).toBe(true);
    expect(shouldSendCapture({ key: 'k', at: 1000 }, 'k', 1000 + CAPTURE_DEDUPE_MS - 1)).toBe(false);
    expect(shouldSendCapture({ key: 'k', at: 1000 }, 'k', 1000 + CAPTURE_DEDUPE_MS)).toBe(true);
    expect(shouldSendCapture({ key: 'k', at: 1000 }, 'other', 1001)).toBe(true);
  });
});
