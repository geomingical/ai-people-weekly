import { describe, expect, it } from 'vitest';
import {
  canonicalUrl,
  ingestSourceItems,
  screenSourceItems,
  storyId,
  type IngestSource,
} from '../src/ingest';
import type { RawFeedItem } from '../src/contracts';

const source: IngestSource = {
  id: 'test',
  officialDomains: ['example.org'],
  relevanceMode: 'always',
  defaultTopics: ['relationships'],
  maxPerRun: 10,
  region: 'US',
  language: 'en',
  dateStrategy: 'rss',
};

const window = {
  start: new Date('2026-08-10T00:00:00Z'),
  end: new Date('2026-08-18T12:00:00Z'),
};

function item(overrides: Partial<RawFeedItem> = {}): RawFeedItem {
  const base = {
    title: 'AI in schools',
    link: 'https://example.org/a',
    summary: 'A summary.',
    fullText: '',
    publishedAt: '2026-08-15T00:00:00.000Z',
    doi: null,
    guid: null,
    ...overrides,
  };
  // The date now comes from publishedAtRaw, so a test that overrides the date
  // has to move both. Deriving it here keeps that from being a trap.
  return { ...base, publishedAtRaw: overrides.publishedAtRaw ?? base.publishedAt ?? '' };
}

function run(items: RawFeedItem[], overrides: Partial<IngestSource> = {}, seen = new Set<string>()) {
  return ingestSourceItems({ ...source, ...overrides }, items, window, seen);
}

describe('ingest gate', () => {
  it('accepts a well-formed in-window item', () => {
    const result = run([item()]);
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]).toMatchObject({ sourceId: 'test', region: 'US', topics: ['relationships'] });
  });

  it.each([
    ['an empty title', { title: '   ' }, 'no-title'],
    ['a non-https link', { link: 'http://example.org/a' }, 'bad-url'],
    ['a javascript: link', { link: 'javascript:alert(1)' }, 'bad-url'],
    ['no publication date', { publishedAt: null }, 'no-date'],
    ['a date before the window', { publishedAt: '2026-01-01T00:00:00.000Z' }, 'outside-window'],
  ])('rejects %s', (_label, overrides, reason) => {
    const result = run([item(overrides as Partial<RawFeedItem>)]);
    expect(result.accepted).toEqual([]);
    expect(result.rejectCounts[reason as keyof typeof result.rejectCounts]).toBe(1);
  });

  // A feed on an allowlisted host can still link anywhere.
  it('rejects a link that leaves the source’s own domains', () => {
    const result = run([item({ link: 'https://elsewhere.test/a' })]);
    expect(result.rejectCounts['off-domain']).toBe(1);
  });

  it('accepts a link on a subdomain of an official domain', () => {
    expect(run([item({ link: 'https://news.example.org/a' })]).accepted).toHaveLength(1);
  });

  // One real outlet ships items dated weeks ahead. An automatic publisher must
  // not let that create an issue for a week that has not happened.
  it('rejects an item dated far in the future', () => {
    const result = run([item({ publishedAt: '2026-09-29T00:00:00.000Z' })]);
    expect(result.rejectCounts['future-dated']).toBe(1);
  });

  it('tolerates a feed clock a few hours ahead', () => {
    expect(run([item({ publishedAt: '2026-08-18T15:00:00.000Z' })]).accepted).toHaveLength(1);
  });

  // `always` sources publish without asking anyone; `keyword` sources need a
  // model verdict, and without one they are held rather than published.
  it('publishes an always source unjudged, and holds a keyword source', () => {
    const offTopic = item({ title: 'Quarterly earnings report', summary: '' });
    expect(run([offTopic], { relevanceMode: 'always' }).accepted).toHaveLength(1);
    expect(run([offTopic], { relevanceMode: 'keyword' }).accepted).toHaveLength(0);
  });
});

describe('de-duplication', () => {
  it('rejects an item already seen in this run', () => {
    const result = run([item(), item()]);
    expect(result.accepted).toHaveLength(1);
    expect(result.rejectCounts['duplicate']).toBe(1);
  });

  it('treats the same article with tracking parameters as one story', () => {
    const result = run([item(), item({ link: 'https://example.org/a?utm_source=newsletter' })]);
    expect(result.accepted).toHaveLength(1);
  });

  it('shares its seen-set with the caller so cross-feed duplicates collapse', () => {
    const seen = new Set<string>();
    run([item()], {}, seen);
    expect(run([item()], { id: 'other' }, seen).accepted).toHaveLength(0);
  });
});

describe('per-source cap', () => {
  // Without it, one high-volume feed silently becomes the whole issue.
  it('keeps the newest items and rejects the rest', () => {
    const items = [
      item({ link: 'https://example.org/old', publishedAt: '2026-08-11T00:00:00.000Z' }),
      item({ link: 'https://example.org/new', publishedAt: '2026-08-17T00:00:00.000Z' }),
      item({ link: 'https://example.org/mid', publishedAt: '2026-08-14T00:00:00.000Z' }),
    ];
    const result = run(items, { maxPerRun: 2 });
    expect(result.accepted.map((entry) => entry.url)).toEqual([
      'https://example.org/new',
      'https://example.org/mid',
    ]);
    expect(result.rejectCounts['over-cap']).toBe(1);
  });

  // An over-cap item must stay eligible for a later run.
  it('does not mark a capped-out item as seen', () => {
    const seen = new Set<string>();
    run([item({ link: 'https://example.org/1' }), item({ link: 'https://example.org/2' })], { maxPerRun: 1 }, seen);
    expect(seen.size).toBe(1);
  });
});

describe('canonicalUrl and storyId', () => {
  it('strips tracking parameters, fragments, and a trailing slash', () => {
    expect(canonicalUrl('https://Example.org/a/?utm_source=x&id=7#top')).toBe(
      'https://example.org/a?id=7',
    );
  });

  it('gives the same id to the same article across runs', () => {
    expect(storyId('https://example.org/a')).toBe(storyId('https://example.org/a/?utm_medium=rss'));
  });

  it('gives different ids to different articles', () => {
    expect(storyId('https://example.org/a')).not.toBe(storyId('https://example.org/b'));
  });

  it('returns the input rather than throwing on an unparseable URL', () => {
    expect(canonicalUrl('not a url')).toBe('not a url');
  });
});


// The education project fell back to keyword rules when the model was down, so
// a model outage degraded judgement rather than stopping the week. That was
// right there. Here the editorial line is whether a person or a model was
// measured, which no word list can answer, and this site publishes without
// review — so an outage must publish nothing rather than publish unvetted.
describe('relevance fails closed', () => {
  it('publishes nothing when the model reached no verdict', () => {
    const result = run([item()], { relevanceMode: 'keyword' });
    expect(result.accepted).toHaveLength(0);
    expect(result.rejectCounts.undecided).toBe(1);
  });

  it('does not call an outage irrelevant — it has its own reason', () => {
    const result = run([item()], { relevanceMode: 'keyword' });
    expect(result.rejectCounts['not-relevant']).toBeUndefined();
  });

  it('still publishes an always-relevant source when the model is down', () => {
    const result = run([item()], { relevanceMode: 'always' });
    expect(result.accepted).toHaveLength(1);
  });
});


// A count cannot tell a masthead page from a real study, and by the time a
// count draws attention the item may have rotated out of the feed. The report
// is written to disk, so the URL survives even then.
describe('reject details', () => {
  it('keeps url and raw date for a month-only item so it can be checked later', () => {
    const result = screenSourceItems(
      source,
      [
        item({
          title: 'Advisory Board and Contents',
          link: 'https://example.org/front-matter',
          publishedAtRaw: '2026-08',
        }),
      ],
      window,
      new Set(),
    );
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toMatchObject({
      reason: 'imprecise-date',
      url: 'https://example.org/front-matter',
      rawDate: '2026-08',
    });
  });

  // not-relevant is hundreds of items a week once whole arXiv categories are
  // subscribed. A log nobody reads is not observability, it is a bigger report.
  it('does not keep details for high-volume reasons', () => {
    const result = screenSourceItems(
      source,
      [item({ publishedAtRaw: '2020-01-01T00:00:00.000Z' })],
      window,
      new Set(),
    );
    expect(result.rejectCounts['outside-window']).toBe(1);
    expect(result.rejected.filter((r) => r.reason === 'outside-window')).toHaveLength(0);
  });
});
