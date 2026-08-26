// Sitemap-indexed sources.
//
// Some publishers worth watching simply do not publish a feed. Anthropic is the
// case that forced this: every conventional RSS path returns 404 and no page
// declares a feed, but `anthropic.com/sitemap.xml` lists 515 URLs, every one
// carrying a `<lastmod>` date, and its robots.txt both allows crawling and
// advertises the sitemap.
//
// A sitemap is the right fallback rather than scraping a listing page. It is a
// published standard with a published date field, so it does not break when the
// site is redesigned — which is exactly what a CSS-selector scraper does, and
// exactly the fragility that would make this unmaintainable.
//
// A sitemap entry carries no title and no body, so each surviving URL's page is
// fetched and read with the same Readability extractor the article stage uses.
// That is why the filtering order matters: pattern, then date window, then cap,
// and only then fetch. Skipping that order would mean fetching hundreds of
// pages to publish a handful.

import { XMLParser } from 'fast-xml-parser';
import { fetchArticleText, type ArticleResult } from './article';
import type { FetchIO } from './fetcher';
import type { RawFeedItem } from './contracts';
import { truncateSummary } from './feed-parser';

const parser = new XMLParser({
  ignoreAttributes: true,
  trimValues: true,
  parseTagValue: false,
});

export interface SitemapEntry {
  loc: string;
  lastmod: string | null;
}

/** Parses a `<urlset>`. Never throws: a broken sitemap is an empty result. */
export function parseSitemap(body: string): { entries: SitemapEntry[]; error: string | null } {
  let document: Record<string, unknown>;
  try {
    document = parser.parse(body) as Record<string, unknown>;
  } catch (error) {
    return { entries: [], error: `sitemap parse failed: ${(error as Error).message}` };
  }

  const urlset = document['urlset'] as { url?: unknown } | undefined;
  if (!urlset) {
    // A sitemap index points at further sitemaps; following it is a second
    // round trip this project has no source that needs yet.
    if (document['sitemapindex']) {
      return { entries: [], error: 'sitemap index (nested sitemaps) is not supported' };
    }
    return { entries: [], error: 'body is not a sitemap urlset' };
  }

  const raw = urlset.url;
  const list = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];

  const entries = list.flatMap((item): SitemapEntry[] => {
    const record = item as Record<string, unknown>;
    const loc = typeof record['loc'] === 'string' ? record['loc'].trim() : '';
    if (loc.length === 0) return [];
    const lastmod = typeof record['lastmod'] === 'string' ? record['lastmod'].trim() : '';
    return [{ loc, lastmod: lastmod.length > 0 ? lastmod : null }];
  });

  return { entries, error: null };
}

export interface SitemapSelection {
  /** Only URLs containing this substring are candidates — e.g. "/news/". */
  urlPattern: string;
  windowStart: Date;
  windowEnd: Date;
  /** Hard ceiling on how many pages this source may cause us to fetch. */
  maxPages: number;
}

/**
 * Narrows a sitemap down to the pages worth fetching: right section, published
 * inside the window, newest first, capped.
 *
 * `lastmod` is "last modified", not "first published" — an old page that was
 * edited re-enters the window. De-duplication by URL upstream is what stops
 * that from republishing it.
 */
export function selectSitemapEntries(
  entries: readonly SitemapEntry[],
  selection: SitemapSelection,
): SitemapEntry[] {
  const pattern = selection.urlPattern.toLowerCase();

  return entries
    .filter((entry) => entry.loc.toLowerCase().includes(pattern))
    .filter((entry) => {
      if (entry.lastmod === null) return false;
      const at = Date.parse(entry.lastmod);
      if (Number.isNaN(at)) return false;
      return at >= selection.windowStart.getTime() && at <= selection.windowEnd.getTime();
    })
    .sort((left, right) => Date.parse(right.lastmod!) - Date.parse(left.lastmod!))
    .slice(0, selection.maxPages);
}

export interface SitemapFetchResult {
  items: RawFeedItem[];
  pagesFetched: number;
  pagesFailed: number;
  error: string | null;
}

/**
 * Turns the selected sitemap entries into feed-shaped items by reading each
 * page. A page that cannot be read is skipped, not fatal — the same rule the
 * rest of the pipeline follows.
 */
export async function itemsFromSitemap(
  entries: readonly SitemapEntry[],
  allowedDomains: readonly string[],
  io: FetchIO,
  pace: (url: string) => Promise<void>,
  fetchPage: (
    url: string,
    domains: readonly string[],
    io: FetchIO,
  ) => Promise<ArticleResult> = fetchArticleText,
): Promise<SitemapFetchResult> {
  const items: RawFeedItem[] = [];
  let pagesFetched = 0;
  let pagesFailed = 0;

  for (const entry of entries) {
    await pace(entry.loc);
    const article = await fetchPage(entry.loc, allowedDomains, io);
    pagesFetched += 1;

    if (article.text === null || article.title === null || article.title.length === 0) {
      pagesFailed += 1;
      continue;
    }

    items.push({
      title: article.title,
      link: entry.loc,
      // The excerpt that gets published: the article's opening, capped by the
      // same rule feed excerpts use. The body stays in fullText, unpublished.
      summary: truncateSummary(article.text),
      fullText: article.text,
      publishedAt: entry.lastmod === null ? null : new Date(entry.lastmod).toISOString(),
      guid: entry.loc,
    });
  }

  return { items, pagesFetched, pagesFailed, error: null };
}
