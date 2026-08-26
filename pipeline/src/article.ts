// Article-page fetching and text extraction.
//
// WHEN THIS RUNS: only when the feed did not already carry the article body.
// Most publishers put the whole post in `content:encoded`, and taking it from
// there costs nothing and asks nothing of their servers. This module is the
// fallback for the ones that ship a one-line teaser instead.
//
// WHAT HAPPENS TO THE TEXT: it is summarized and thrown away. It is never
// stored in src/data/stories.json and never rendered on the site. That is not
// an implementation detail — several sources in the registry state "summary and
// link only", and keeping 7,000-character article bodies in a published JSON
// file would be republishing them. The story record keeps a short excerpt for
// display and the link; the full text lives only in memory, for one model call.
//
// The same SSRF-safe fetcher guards this as guards the feeds: https only, the
// host must be one of the source's own official domains, every redirect hop is
// re-validated, private IPs are refused, and body size and time are capped.

import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { safeFetch, type FetchIO } from './fetcher';
import { toPlainText } from './feed-parser';

export interface ArticleResult {
  text: string | null;
  /** The page's own headline. Needed by sources indexed through a sitemap,
   *  which lists URLs and dates but no titles. */
  title: string | null;
  /** Why there is no text, for the run report. Never a reason to end a run. */
  error: string | null;
  status: number | null;
}

/**
 * Upper bound on what one model call receives. Bounded input is one of the
 * prompt-injection defences: an article body is untrusted third-party text, and
 * a provable cap is what keeps a hostile page from setting the prompt size.
 * Generous enough that a normal article arrives whole.
 */
export const MAX_ARTICLE_CHARS = 12_000;

/**
 * Politeness pacing, per host.
 *
 * Crawl-delay is a rule about how often ONE server is asked, not a global
 * speed limit. Sleeping between requests to different sites would have made a
 * 66-story backfill eleven minutes slower while being no more polite to anyone.
 */
export function createHostPacer(delayMs: number, sleep: (ms: number) => Promise<void>) {
  const lastRequestAt = new Map<string, number>();
  return async (url: string, now: () => number): Promise<void> => {
    let host: string;
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      return;
    }
    const previous = lastRequestAt.get(host);
    if (previous !== undefined) {
      const wait = delayMs - (now() - previous);
      if (wait > 0) await sleep(wait);
    }
    lastRequestAt.set(host, now());
  };
}


/** Below this, extraction almost certainly hit a paywall, a cookie wall, or a
 *  JavaScript-rendered shell — better to fall back than to summarize furniture. */
export const MIN_USABLE_CHARS = 200;

/**
 * Pulls the readable body out of an HTML page.
 *
 * Readability is Firefox's reader-mode extractor: it is the battle-tested
 * answer to "which part of this page is the article", and hand-rolled
 * heuristics lose to it on exactly the pages that matter. Returns null when it
 * cannot find enough text to be worth summarizing.
 */
export function extractArticle(html: string): { title: string; text: string } | null {
  let title: string;
  let text: string;
  try {
    // linkedom gives Readability a DOM without running any page script.
    const { document } = parseHTML(html);
    const parsed = new Readability(document as unknown as Document).parse();
    title = parsed?.title ?? '';
    text = parsed?.textContent ?? '';
  } catch {
    // A malformed page is an outcome, not an exception.
    return null;
  }

  // Readability returns text, but pages sometimes smuggle entities and stray
  // markup through it; normalize with the same cleaner the feeds use.
  const cleaned = toPlainText(text).trim();
  if (cleaned.length < MIN_USABLE_CHARS) return null;
  return {
    title: toPlainText(title).trim(),
    text: cleaned.slice(0, MAX_ARTICLE_CHARS),
  };
}

export function extractArticleText(html: string, _url?: string): string | null {
  return extractArticle(html)?.text ?? null;
}

/**
 * Fetches an article page and returns its readable text.
 *
 * Never throws. Every failure — blocked host, network error, timeout, non-2xx,
 * paywall, unextractable page — comes back as a null text with a reason, and
 * the caller falls back to whatever the feed gave it.
 */
export async function fetchArticleText(
  url: string,
  allowedDomains: readonly string[],
  io: FetchIO,
): Promise<ArticleResult> {
  const fetched = await safeFetch(url, allowedDomains, io);

  if (fetched.error !== null) {
    return { text: null, title: null, error: `fetch ${fetched.error}`, status: fetched.status };
  }
  if (fetched.body === null) {
    return { text: null, title: null, error: `no body (HTTP ${fetched.status})`, status: fetched.status };
  }

  const article = extractArticle(fetched.body);
  if (article === null) {
    return {
      text: null,
      title: null,
      error: 'no readable article text (paywall, cookie wall, or script-rendered page)',
      status: fetched.status,
    };
  }

  return { text: article.text, title: article.title, error: null, status: fetched.status };
}
