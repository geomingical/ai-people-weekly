// Feed parsing: RSS 2.0, Atom, and JSON Feed into one flat item shape.
//
// Everything in a feed is untrusted third-party text. This module's job is to
// normalize it, not to trust it: it decodes entities, strips markup out of
// summaries, and hands back plain strings. Link validation (https-only,
// allowlisted host) happens in the ingest stage, not here — a parser that also
// enforced policy would be two jobs in one file.

import { XMLParser } from 'fast-xml-parser';
import type { FeedParseResult, RawFeedItem } from './contracts';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  // Feeds routinely wrap summaries in CDATA and use namespaced elements
  // (content:encoded, dc:date). Keeping the raw tag names means the lookups
  // below can name them explicitly rather than guessing.
  removeNSPrefix: false,
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
});

/** Some feeds nest text as { '#text': '…' }; some give a bare string. */
function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object') {
    const node = value as Record<string, unknown>;
    if (typeof node['#text'] === 'string') return node['#text'];
  }
  return '';
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  mdash: '—', ndash: '–', hellip: '…',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/**
 * Summaries arrive as HTML fragments. The site renders them as text, so tags
 * are removed here rather than escaped downstream — script and style contents
 * are dropped entirely so their bodies never surface as visible words.
 */
export function toPlainText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/p>/gi, ' ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** Caps a summary at a whole-word boundary. Feeds sometimes ship whole articles. */
export function truncateSummary(text: string, maxChars = 400): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  // CJK text has no spaces; a space-based cut would return almost nothing,
  // so fall back to a hard cut when no late word boundary exists.
  const body = lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${body.trimEnd()}…`;
}

function normalizeDate(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

/**
 * Plain text of whichever field actually carries the article, or '' when
 * neither does. A body only counts as "the article" when it is substantially
 * longer than the teaser — a `content:encoded` that merely repeats the
 * description is not worth treating as full text.
 */
export const FULL_TEXT_MIN_CHARS = 600;

function pickRicher(candidate: string, teaser: string): string {
  const body = toPlainText(candidate);
  if (body.length < FULL_TEXT_MIN_CHARS) return '';
  if (body.length <= toPlainText(teaser).length * 1.5) return '';
  return body;
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const text = textOf(value);
    if (text.length > 0) return text;
  }
  return '';
}

function parseRssItems(channel: Record<string, unknown>): RawFeedItem[] {
  return asArray(channel['item'] as Record<string, unknown> | Record<string, unknown>[])
    .map((item): RawFeedItem => {
      // `description` is the teaser; `content:encoded` is usually the whole
      // post. Both are read: the short one is what gets published, the long
      // one is what the model reads. Taking whichever came first — which this
      // did until it was measured — threw away a 7,000-character body sitting
      // beside a 101-character teaser on four of the registry's feeds.
      const description = textOf(item['description']);
      const encoded = textOf(item['content:encoded']);
      const teaser = description || encoded;
      const body = pickRicher(encoded, description);

      return {
        title: toPlainText(textOf(item['title'])),
        link: textOf(item['link']).trim(),
        summary: truncateSummary(toPlainText(teaser)),
        fullText: body,
        publishedAt: normalizeDate(
          firstNonEmpty(item['pubDate'], item['dc:date'], item['date']),
        ),
        guid: textOf(item['guid']).trim() || null,
      };
    });
}

/** Atom links are attribute-carrying elements; prefer rel="alternate". */
function atomLink(entry: Record<string, unknown>): string {
  const links = asArray(entry['link'] as Record<string, unknown> | Record<string, unknown>[]);
  const alternate = links.find((link) => {
    const rel = link['@rel'];
    return rel === undefined || rel === 'alternate';
  });
  const chosen = alternate ?? links[0];
  if (!chosen) return textOf(entry['link']).trim();
  const href = chosen['@href'];
  return typeof href === 'string' ? href.trim() : '';
}

function parseAtomEntries(feed: Record<string, unknown>): RawFeedItem[] {
  return asArray(feed['entry'] as Record<string, unknown> | Record<string, unknown>[])
    .map((entry): RawFeedItem => {
      const summary = textOf(entry['summary']);
      const content = textOf(entry['content']);
      return {
        title: toPlainText(textOf(entry['title'])),
        link: atomLink(entry),
        summary: truncateSummary(toPlainText(summary || content)),
        fullText: pickRicher(content, summary),
        publishedAt: normalizeDate(firstNonEmpty(entry['published'], entry['updated'])),
        guid: textOf(entry['id']).trim() || null,
      };
    });
}

function parseJsonFeed(body: string): FeedParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { items: [], format: 'json', error: 'body is not valid JSON' };
  }
  const feed = parsed as { items?: unknown };
  if (!Array.isArray(feed.items)) {
    return { items: [], format: 'json', error: 'JSON feed has no items array' };
  }

  const items = feed.items.map((raw): RawFeedItem => {
    const item = raw as Record<string, unknown>;
    const contentHtml = typeof item['content_html'] === 'string' ? item['content_html'] : '';
    const contentText = typeof item['content_text'] === 'string' ? item['content_text'] : '';
    const summary = typeof item['summary'] === 'string' ? item['summary'] : '';
    return {
      title: toPlainText(typeof item['title'] === 'string' ? item['title'] : ''),
      link: typeof item['url'] === 'string' ? item['url'].trim() : '',
      summary: truncateSummary(toPlainText(summary || contentText || contentHtml)),
      fullText: pickRicher(contentHtml || contentText, summary),
      publishedAt: normalizeDate(
        typeof item['date_published'] === 'string' ? item['date_published'] : '',
      ),
      guid: typeof item['id'] === 'string' ? item['id'] : null,
    };
  });

  return { items, format: 'json', error: null };
}

/**
 * Parses a feed body. Never throws: an unparseable body is an outcome, not an
 * exception, because one broken feed must not end a weekly run.
 */
export function parseFeed(body: string): FeedParseResult {
  const trimmed = body.trimStart();
  if (trimmed.startsWith('{')) return parseJsonFeed(trimmed);

  let document: Record<string, unknown>;
  try {
    document = parser.parse(trimmed) as Record<string, unknown>;
  } catch (error) {
    return {
      items: [],
      format: 'unknown',
      error: `XML parse failed: ${(error as Error).message}`,
    };
  }

  const rss = document['rss'] as Record<string, unknown> | undefined;
  if (rss) {
    const channel = rss['channel'] as Record<string, unknown> | undefined;
    if (!channel) return { items: [], format: 'rss', error: 'rss feed has no channel' };
    return { items: parseRssItems(channel), format: 'rss', error: null };
  }

  // RDF-based RSS 1.0 puts <item> at the document root, not under a channel.
  const rdf = document['rdf:RDF'] as Record<string, unknown> | undefined;
  if (rdf) return { items: parseRssItems(rdf), format: 'rss', error: null };

  const feed = document['feed'] as Record<string, unknown> | undefined;
  if (feed) return { items: parseAtomEntries(feed), format: 'atom', error: null };

  return { items: [], format: 'unknown', error: 'body is neither RSS, RDF, Atom, nor JSON Feed' };
}
