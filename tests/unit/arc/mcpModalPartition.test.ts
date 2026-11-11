import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

// McpModal is a React component rendered in Electron; vitest runs in node, so
// these checks read the source (as bugCondition.test.ts does for McpModal).
const src = readFileSync(path.resolve(__dirname, '../../../src/renderer/components/McpModal.tsx'), 'utf8');

describe('McpModal assistant webview session (task 12.8)', () => {
  it('takes the partition from a prop that defaults to the default profile session', () => {
    expect(src).toMatch(/partition\?: string;/);
    expect(src).toMatch(/partition = DEFAULT_ASSISTANT_PARTITION/);
    // The default is the default profile's partition ('persist:neutrino'), taken from partition.ts.
    expect(src).toMatch(/import \{ DEFAULT_PARTITION \} from '\.\.\/\.\.\/main\/profiles\/partition'/);
    expect(src).toMatch(/DEFAULT_ASSISTANT_PARTITION = DEFAULT_PARTITION;/);
    expect(src).not.toMatch(/persist:neutrino/);
  });

  it('has no per-assistant hard-coded partition', () => {
    const block = src.match(/const ASSISTANTS[^=]*=\s*\[([\s\S]*?)\n\];/);
    expect(block).not.toBeNull();
    expect(block![1]).not.toMatch(/partition/);
    // All five providers are still listed (bugfix 3.7).
    for (const id of ['claude', 'chatgpt', 'gemini', 'deepseek', 'perplexity']) {
      expect(block![1]).toContain(`id: '${id}'`);
    }
  });

  it('keys the webview by partition and marks it as an assistant webview', () => {
    const webview = src.match(/React\.createElement\('webview', \{([\s\S]*?)\}\)/);
    expect(webview).not.toBeNull();
    expect(webview![1]).toMatch(/key: `[^`]*\$\{partition\}[^`]*`/);
    expect(webview![1]).toMatch(/^\s*partition,$/m);
    expect(webview![1]).toMatch(/webpreferences: ASSISTANT_WEBPREFERENCES/);
    expect(src).toMatch(
      /ASSISTANT_WEBPREFERENCES = withAssistantMarker\('contextIsolation=yes,nodeIntegration=no'\)/,
    );
    expect(src).toMatch(/import \{ withAssistantMarker \} from '\.\.\/\.\.\/main\/passwords\/webviewMarker'/);
  });
});
