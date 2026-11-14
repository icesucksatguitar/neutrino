// Feature: arc-spaces-profiles-redesign, task 12.2: ArchiveList markup (R16.7).
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArchiveListView, formatArchivedAt, type ArchiveListViewProps } from '../../../src/renderer/components/ArchiveList';
import type { ArchiveListEntry } from '../../../src/renderer/types';

const noop = () => { };
const T = 1_700_000_000_000;

function entry(id: string, archivedAt: number, spaceName: string | null = 'Work'): ArchiveListEntry {
  return { id, profileId: 'p1', spaceId: 's1', url: `https://${id}.test/page`, title: `Title ${id}`, archivedAt, spaceName };
}

function render(over: Partial<ArchiveListViewProps> = {}): string {
  return renderToStaticMarkup(
    createElement(ArchiveListView, { isOpen: true, onClose: noop, entries: [], onRestore: noop, ...over }),
  );
}

describe('ArchiveListView', () => {
  it('renders nothing while closed', () => {
    expect(render({ isOpen: false, entries: [entry('a', T)] })).toBe('');
  });

  it('shows an empty state', () => {
    expect(render()).toContain('No archived tabs');
  });

  it('shows title, URL, space and archive time newest first, each with a restore button', () => {
    const html = render({ entries: [entry('old', T - 1000), entry('new', T, null)] });
    const titles = [...html.matchAll(/archive-row-title">([^<]+)</g)].map((m) => m[1]);
    expect(titles).toEqual(['Title new', 'Title old']);
    expect(html).toContain('https://new.test/page');
    expect(html).toContain('Work');
    expect(html).toContain('Deleted space');
    expect(html).toContain(`="${new Date(T).toISOString()}"`);
    expect(html).toContain(formatArchivedAt(T).replace('·', '&#183;').split(' ')[0]);
    expect(html).toContain('aria-label="Restore Title new"');
    expect(html).toContain('aria-label="Restore Title old"');
  });
});
