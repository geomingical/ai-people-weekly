import { describe, expect, it } from 'vitest';
import { resolvePublishedAt } from '../src/published-at';
import type { RawFeedItem } from '../src/contracts';

function item(over: Partial<RawFeedItem> = {}): RawFeedItem {
  return {
    title: 't',
    link: 'https://example.org/x',
    summary: '',
    fullText: '',
    publishedAt: null,
    publishedAtRaw: '',
    doi: null,
    guid: null,
    ...over,
  };
}

describe('resolvePublishedAt', () => {
  // Real string from rss.sciencedirect.com, 2026-08-25.
  it('reads ScienceDirect prose dates out of the description', () => {
    const r = resolvePublishedAt(
      'prose',
      item({
        summary:
          'Publication date: Available online 22 August 2026 Source: Computers in Human Behavior: Artificial Humans Author(s): Ziv Ben-Zion',
      }),
    );
    expect(r.iso).toBe('2026-08-22T00:00:00.000Z');
    expect(r.precision).toBe('day');
  });

  it('reads ISO dc:date', () => {
    const r = resolvePublishedAt('dcdate', item({ publishedAtRaw: '2026-08-24' }));
    expect(r.iso).toBe('2026-08-24T00:00:00.000Z');
    expect(r.precision).toBe('day');
  });

  // Real value from cell.com: issue front matter carries only a month.
  it('reports month-only precision without inventing a day', () => {
    const r = resolvePublishedAt('dcdate', item({ publishedAtRaw: '2026-08' }));
    expect(r.iso).toBeNull();
    expect(r.precision).toBe('month');
    expect(r.rawValue).toBe('2026-08');
  });

  // Real value from rss.arxiv.org.
  it('reads RFC 822 pubDate from arXiv category RSS', () => {
    const r = resolvePublishedAt('rss', item({ publishedAtRaw: 'Tue, 25 Aug 2026 00:00:00 -0400' }));
    expect(r.iso).toBe('2026-08-25T04:00:00.000Z');
    expect(r.precision).toBe('day');
  });

  // The arXiv query API is Atom: published, not pubDate.
  it('reads Atom published', () => {
    const r = resolvePublishedAt('atom', item({ publishedAtRaw: '2026-04-03T03:02:42Z' }));
    expect(r.iso).toBe('2026-04-03T03:02:42.000Z');
  });

  it('returns null precision when there is no date at all', () => {
    expect(resolvePublishedAt('dcdate', item()).precision).toBeNull();
  });

  it('never returns an iso value when precision is month', () => {
    for (const raw of ['2026-08', '2025-12', '2026-8']) {
      expect(resolvePublishedAt('dcdate', item({ publishedAtRaw: raw })).iso).toBeNull();
    }
  });

  // "Publication date: August 2026" is an issue date, not an online-first one.
  it('treats a prose month with no day as month precision', () => {
    const r = resolvePublishedAt('prose', item({ summary: 'Publication date: August 2026 Source: X' }));
    expect(r.iso).toBeNull();
    expect(r.precision).toBe('month');
  });
});
