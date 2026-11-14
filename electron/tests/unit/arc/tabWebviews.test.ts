import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { TabWebviewRegistry } from '../../../src/main/previews/tabWebviews';

describe('TabWebviewRegistry', () => {
  it('binds a tab to its guest webContents both ways', () => {
    const r = new TabWebviewRegistry();
    r.set('tab-a', 7);
    expect(r.webContentsIdOf('tab-a')).toBe(7);
    expect(r.tabIdOf(7)).toBe('tab-a');
  });

  it('rebinding a tab to a new webview (remount) forgets the old guest', () => {
    const r = new TabWebviewRegistry();
    r.set('tab-a', 7);
    r.set('tab-a', 9);
    expect(r.webContentsIdOf('tab-a')).toBe(9);
    expect(r.tabIdOf(7)).toBeUndefined();
    expect(r.size).toBe(1);
  });

  it('a destroyed guest or a removed tab drops the binding', () => {
    const r = new TabWebviewRegistry();
    r.set('tab-a', 7);
    r.set('tab-b', 8);
    r.deleteWebContents(7);
    r.deleteTab('tab-b');
    expect(r.webContentsIdOf('tab-a')).toBeUndefined();
    expect(r.tabIdOf(8)).toBeUndefined();
    expect(r.size).toBe(0);
  });

  it('stays a one-to-one mapping for any sequence of operations', () => {
    const op = fc.oneof(
      fc.record({ k: fc.constant('set' as const), tab: fc.constantFrom('a', 'b', 'c'), wc: fc.integer({ min: 1, max: 4 }) }),
      fc.record({ k: fc.constant('delTab' as const), tab: fc.constantFrom('a', 'b', 'c') }),
      fc.record({ k: fc.constant('delWc' as const), wc: fc.integer({ min: 1, max: 4 }) }),
    );
    fc.assert(
      fc.property(fc.array(op, { maxLength: 30 }), (ops) => {
        const r = new TabWebviewRegistry();
        for (const o of ops) {
          if (o.k === 'set') r.set(o.tab, o.wc);
          else if (o.k === 'delTab') r.deleteTab(o.tab);
          else r.deleteWebContents(o.wc);
        }
        for (const tab of ['a', 'b', 'c']) {
          const wc = r.webContentsIdOf(tab);
          if (wc !== undefined) expect(r.tabIdOf(wc)).toBe(tab);
        }
        for (const wc of [1, 2, 3, 4]) {
          const tab = r.tabIdOf(wc);
          if (tab !== undefined) expect(r.webContentsIdOf(tab)).toBe(wc);
        }
      }),
    );
  });
});
