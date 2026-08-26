import { describe, expect, it, vi } from 'vitest';
import { itemsFromSitemap, parseSitemap, selectSitemapEntries } from '../src/sitemap';
import type { ArticleResult } from '../src/article';
import type { FetchIO } from '../src/fetcher';

const io = {} as FetchIO;
const noPace = async () => {};

function urlset(entries: { loc: string; lastmod?: string }[]): string {
  const body = entries
    .map((e) => `<url><loc>${e.loc}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}</url>`)
    .join('');
  return `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
}

describe('parseSitemap', () => {
  it('reads locations and dates', () => {
    const result = parseSitemap(
      urlset([
        { loc: 'https://e.org/news/a', lastmod: '2026-08-18T00:00:00Z' },
        { loc: 'https://e.org/pricing' },
      ]),
    );
    expect(result.error).toBeNull();
    expect(result.entries).toEqual([
      { loc: 'https://e.org/news/a', lastmod: '2026-08-18T00:00:00Z' },
      { loc: 'https://e.org/pricing', lastmod: null },
    ]);
  });

  it('handles a single-entry sitemap', () => {
    expect(parseSitemap(urlset([{ loc: 'https://e.org/only' }])).entries).toHaveLength(1);
  });

  // A broken sitemap is an outcome, not an exception — one bad source must not
  // end a weekly run.
  it.each([
    ['an RSS feed', '<rss version="2.0"><channel></channel></rss>'],
    ['an HTML page', '<html><body>Not a sitemap</body></html>'],
    ['empty input', ''],
  ])('reports %s without throwing', (_label, body) => {
    const result = parseSitemap(body);
    expect(result.entries).toEqual([]);
    expect(result.error).not.toBeNull();
  });

  it('says plainly that a nested sitemap index is unsupported', () => {
    const result = parseSitemap('<?xml version="1.0"?><sitemapindex><sitemap><loc>https://e.org/s1.xml</loc></sitemap></sitemapindex>');
    expect(result.error).toMatch(/sitemap index/);
  });
});

describe('selectSitemapEntries', () => {
  const window = {
    windowStart: new Date('2026-08-10T00:00:00Z'),
    windowEnd: new Date('2026-08-20T00:00:00Z'),
  };
  const entries = [
    { loc: 'https://e.org/news/new', lastmod: '2026-08-18T00:00:00Z' },
    { loc: 'https://e.org/news/older', lastmod: '2026-08-12T00:00:00Z' },
    { loc: 'https://e.org/news/ancient', lastmod: '2020-01-01T00:00:00Z' },
    { loc: 'https://e.org/pricing', lastmod: '2026-08-19T00:00:00Z' },
    { loc: 'https://e.org/news/undated', lastmod: null },
  ];

  // A sitemap lists the whole site. Without the pattern the pipeline would
  // spend fetches reading the pricing page.
  it('keeps only URLs in the named section', () => {
    const result = selectSitemapEntries(entries, { ...window, urlPattern: '/news/', maxPages: 10 });
    expect(result.map((e) => e.loc)).not.toContain('https://e.org/pricing');
  });

  it('keeps only entries inside the window', () => {
    const result = selectSitemapEntries(entries, { ...window, urlPattern: '/news/', maxPages: 10 });
    expect(result.map((e) => e.loc)).toEqual([
      'https://e.org/news/new',
      'https://e.org/news/older',
    ]);
  });

  it('drops entries with no date, since they cannot be placed in a week', () => {
    const result = selectSitemapEntries(entries, { ...window, urlPattern: '/news/', maxPages: 10 });
    expect(result.map((e) => e.loc)).not.toContain('https://e.org/news/undated');
  });

  it('returns newest first and honours the page cap', () => {
    const result = selectSitemapEntries(entries, { ...window, urlPattern: '/news/', maxPages: 1 });
    expect(result.map((e) => e.loc)).toEqual(['https://e.org/news/new']);
  });

  it('ignores an unparseable date rather than throwing', () => {
    const result = selectSitemapEntries(
      [{ loc: 'https://e.org/news/x', lastmod: 'last tuesday' }],
      { ...window, urlPattern: '/news/', maxPages: 10 },
    );
    expect(result).toEqual([]);
  });
});

describe('itemsFromSitemap', () => {
  const entries = [
    { loc: 'https://e.org/news/a', lastmod: '2026-08-18T00:00:00Z' },
    { loc: 'https://e.org/news/b', lastmod: '2026-08-17T00:00:00Z' },
  ];

  function page(title: string, text: string): ArticleResult {
    return { title, text, error: null, status: 200 };
  }

  it('builds feed-shaped items from the pages it reads', async () => {
    const body = 'The university expanded its AI tutoring pilot this term. '.repeat(20);
    const result = await itemsFromSitemap(entries, ['e.org'], io, noPace, async (url) =>
      page(`Headline for ${url.slice(-1)}`, body),
    );
    expect(result.pagesFetched).toBe(2);
    expect(result.pagesFailed).toBe(0);
    expect(result.items[0]).toMatchObject({
      title: 'Headline for a',
      link: 'https://e.org/news/a',
      publishedAt: '2026-08-18T00:00:00.000Z',
    });
  });

  // The excerpt is what gets published; the body is what the model reads and
  // is never stored.
  it('publishes a short excerpt while keeping the body separate', async () => {
    const body = 'word '.repeat(4000);
    const result = await itemsFromSitemap(entries.slice(0, 1), ['e.org'], io, noPace, async () =>
      page('Headline', body),
    );
    const item = result.items[0]!;
    expect(item.summary.length).toBeLessThanOrEqual(410);
    expect(item.fullText.length).toBeGreaterThan(1000);
  });

  it('skips a page it cannot read instead of failing the source', async () => {
    const result = await itemsFromSitemap(entries, ['e.org'], io, noPace, async (url) =>
      url.endsWith('a')
        ? page('Good', 'Body text that is long enough to be useful. '.repeat(10))
        : { title: null, text: null, error: 'paywall', status: 200 },
    );
    expect(result.items).toHaveLength(1);
    expect(result.pagesFailed).toBe(1);
  });

  // A page with no headline cannot produce a story: the ingest gate requires
  // a title, and inventing one is not an option.
  it('skips a page with no headline', async () => {
    const result = await itemsFromSitemap(entries.slice(0, 1), ['e.org'], io, noPace, async () => ({
      title: '',
      text: 'Body text that is long enough to be useful. '.repeat(10),
      error: null,
      status: 200,
    }));
    expect(result.items).toEqual([]);
    expect(result.pagesFailed).toBe(1);
  });

  it('paces every page it fetches', async () => {
    const pace = vi.fn(async () => {});
    await itemsFromSitemap(entries, ['e.org'], io, pace, async () =>
      page('H', 'Body text that is long enough to be useful. '.repeat(10)),
    );
    expect(pace).toHaveBeenCalledTimes(2);
  });
});
