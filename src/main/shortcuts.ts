export interface ShortcutInput {
  type?: string;
  key: string;
  code?: string;
  control?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export type ShortcutAction =
  | { type: 'close-tab' }
  | { type: 'reopen-closed-tab' }
  | { type: 'new-tab' }
  | { type: 'next-tab' }
  | { type: 'prev-tab' }
  | { type: 'select-space'; index: number }
  | { type: 'go-back' }
  | { type: 'go-forward' }
  | { type: 'go-home' }
  | { type: 'reload' }
  | { type: 'hard-reload' }
  | { type: 'stop' }
  | { type: 'open-command-bar' }
  | { type: 'open-find' }
  | { type: 'toggle-tabs' }
  | { type: 'open-history' }
  | { type: 'open-settings' }
  | { type: 'zoom-in' }
  | { type: 'zoom-out' }
  | { type: 'zoom-reset' }
  | { type: 'escape' };

/**
 * Resolves a single keyboard input into an authoritative browser action.
 * Runs cleanly on both host Chrome UI and `<webview>` guests so shortcuts
 * execute exactly once regardless of focus.
 */
export function resolveShortcut(
  input: ShortcutInput,
  options: { platform?: NodeJS.Platform; isWebview?: boolean } = {}
): ShortcutAction | null {
  if (input.type && input.type !== 'keyDown' && input.type !== 'keydown') {
    return null;
  }

  const platform = options.platform ?? (typeof process !== 'undefined' ? process.platform : 'win32');
  const isMac = platform === 'darwin';
  const ctrl = Boolean(input.control);
  const meta = Boolean(input.meta);
  const shift = Boolean(input.shift);
  const alt = Boolean(input.alt);
  const primary = isMac ? meta : ctrl;
  const secondaryConflict = isMac ? ctrl : meta;

  const key = input.key || '';
  const lower = key.toLowerCase();
  const code = input.code || '';

  if (key === 'Escape' && !ctrl && !meta && !alt) {
    return { type: 'escape' };
  }

  // Dedicated browser media/hardware navigation keys
  if (key === 'BrowserBack') return { type: 'go-back' };
  if (key === 'BrowserForward') return { type: 'go-forward' };
  if (key === 'BrowserRefresh') return { type: 'reload' };
  if (key === 'BrowserStop') return { type: 'stop' };
  if (key === 'BrowserHome') return { type: 'go-home' };

  // Alt+Left / Alt+Right / Alt+Home history & home navigation
  if (alt && !ctrl && !meta && !shift) {
    if (key === 'ArrowLeft') return { type: 'go-back' };
    if (key === 'ArrowRight') return { type: 'go-forward' };
    if (key === 'Home') return { type: 'go-home' };
  }

  // macOS Cmd+[ / Cmd+] / Cmd+ArrowLeft / Cmd+ArrowRight navigation
  if (isMac && meta && !ctrl && !alt && !shift) {
    if (key === '[' || key === 'ArrowLeft') return { type: 'go-back' };
    if (key === ']' || key === 'ArrowRight') return { type: 'go-forward' };
  }

  // F5 / Ctrl+F5 / Shift+F5 reload
  if (key === 'F5' && !alt) {
    return ctrl || meta || shift ? { type: 'hard-reload' } : { type: 'reload' };
  }

  // F6 -> Focus address/command bar
  if (key === 'F6' && !ctrl && !meta && !alt && !shift) {
    return { type: 'open-command-bar' };
  }

  // Ctrl+F4 closes active tab on Windows/Linux
  if (!isMac && ctrl && !meta && !alt && !shift && key === 'F4') {
    return { type: 'close-tab' };
  }

  // Ctrl+Tab / Ctrl+Shift+Tab / Ctrl+PageUp / Ctrl+PageDown cycle tabs on all platforms
  if (ctrl && !alt && !meta) {
    if (key === 'Tab' || code === 'Tab') {
      return shift ? { type: 'prev-tab' } : { type: 'next-tab' };
    }
    if (!shift && key === 'PageDown') return { type: 'next-tab' };
    if (!shift && key === 'PageUp') return { type: 'prev-tab' };
  }

  if (!primary || secondaryConflict || alt) {
    return null;
  }

  if (shift) {
    if (lower === 't') return { type: 'reopen-closed-tab' };
    if (lower === 'r') return { type: 'hard-reload' };
  } else {
    if (lower === 'w') return { type: 'close-tab' };
    if (lower === 't') return { type: 'new-tab' };
    if (lower === 'r') return { type: 'reload' };
    if (lower === 'l' || lower === 'k') return { type: 'open-command-bar' };
    if (lower === 'f') return { type: 'open-find' };
    if (lower === 'e') return { type: 'toggle-tabs' };
    if (lower === 'h') return { type: 'open-history' };
    if (lower === ',') return { type: 'open-settings' };
    // Ctrl/Cmd+1..9 select the Nth space in Space_Switcher order (R13.4, bugfix 2.15).
    if (key.length === 1 && key >= '1' && key <= '9') {
      return { type: 'select-space', index: Number(key) - 1 };
    }
  }

  // Webview zoom shortcuts (host UI itself stays locked at 100%)
  if (options.isWebview) {
    if (key === '-' || key === '_' || code === 'Minus' || code === 'NumpadSubtract') {
      return { type: 'zoom-out' };
    }
    if (key === '=' || key === '+' || code === 'Equal' || code === 'NumpadAdd') {
      return { type: 'zoom-in' };
    }
    if (!shift && (key === '0' || code === 'Numpad0' || code === 'Digit0')) {
      return { type: 'zoom-reset' };
    }
  }

  return null;
}

