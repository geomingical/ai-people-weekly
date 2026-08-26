import { describe, expect, it } from 'vitest';
import { parseFeed, toPlainText, truncateSummary } from '../src/feed-parser';

describe('parseFeed — RSS', () => {
  const rss = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Test</title>
    <item>
      <title>AI arrives in schools</title>
      <link>https://example.org/a</link>
      <description><![CDATA[<p>Twelve districts <b>piloted</b> a tutor.</p>]]></description>
      <pubDate>Mon, 17 Aug 2026 09:00:00 GMT</pubDate>
      <guid>https://example.org/a</guid>
    </item>
  </channel>
</rss>`;

  it('reads title, link, date, and guid', () => {
    const result = parseFeed(rss);
    expect(result.format).toBe('rss');
    expect(result.error).toBeNull();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      title: 'AI arrives in schools',
      link: 'https://example.org/a',
      publishedAt: '2026-08-17T09:00:00.000Z',
      guid: 'https://example.org/a',
    });
  });

  it('strips markup out of a CDATA description', () => {
    expect(parseFeed(rss).items[0]?.summary).toBe('Twelve districts piloted a tutor.');
  });

  it('handles a single-item channel and a multi-item channel the same way', () => {
    const two = rss.replace(
      '</item>',
      `</item><item><title>Second</title><link>https://example.org/b</link><pubDate>Tue, 18 Aug 2026 09:00:00 GMT</pubDate></item>`,
    );
    expect(parseFeed(two).items).toHaveLength(2);
  });

  it('reads RSS 1.0 / RDF, where items sit at the document root', () => {
    const rdf = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <item>
    <title>RDF item</title>
    <link>https://example.org/rdf</link>
    <description>Body</description>
    <dc:date>2026-08-18T00:00:00Z</dc:date>
  </item>
</rdf:RDF>`;
    const result = parseFeed(rdf);
    expect(result.items[0]?.title).toBe('RDF item');
    expect(result.items[0]?.publishedAt).toBe('2026-08-18T00:00:00.000Z');
  });
});

describe('parseFeed — Atom', () => {
  const atom = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Policy update</title>
    <link rel="edit" href="https://example.org/edit"/>
    <link rel="alternate" href="https://example.org/policy"/>
    <summary>Guidance for schools.</summary>
    <published>2026-08-16T10:00:00Z</published>
    <id>tag:example.org,2026:1</id>
  </entry>
</feed>`;

  it('prefers the rel="alternate" link over other link relations', () => {
    expect(parseFeed(atom).items[0]?.link).toBe('https://example.org/policy');
  });

  it('reports the atom format and the entry id as the guid', () => {
    const result = parseFeed(atom);
    expect(result.format).toBe('atom');
    expect(result.items[0]?.guid).toBe('tag:example.org,2026:1');
  });

  it('falls back to <updated> when <published> is absent', () => {
    const updatedOnly = atom.replace(
      '<published>2026-08-16T10:00:00Z</published>',
      '<updated>2026-08-16T11:00:00Z</updated>',
    );
    expect(parseFeed(updatedOnly).items[0]?.publishedAt).toBe('2026-08-16T11:00:00.000Z');
  });
});

describe('parseFeed — JSON Feed', () => {
  it('reads a JSON feed', () => {
    const json = JSON.stringify({
      version: 'https://jsonfeed.org/version/1.1',
      items: [
        {
          id: '1',
          url: 'https://example.org/j',
          title: 'JSON item',
          summary: 'A summary.',
          date_published: '2026-08-18T00:00:00Z',
        },
      ],
    });
    const result = parseFeed(json);
    expect(result.format).toBe('json');
    expect(result.items[0]).toMatchObject({ title: 'JSON item', summary: 'A summary.' });
  });

  it('reports an error rather than throwing on malformed JSON', () => {
    const result = parseFeed('{ not json');
    expect(result.items).toEqual([]);
    expect(result.error).not.toBeNull();
  });
});

// One broken feed must never end a weekly run.
describe('parseFeed — failure modes', () => {
  it('reports, rather than throws, on a body that is not a feed at all', () => {
    const result = parseFeed('<html><body>Not a feed</body></html>');
    expect(result.items).toEqual([]);
    expect(result.error).toMatch(/neither RSS/);
  });

  it('reports an rss element with no channel', () => {
    expect(parseFeed('<rss version="2.0"></rss>').error).toMatch(/no channel/);
  });

  it('treats an unparseable date as no date rather than as now', () => {
    const feed = `<rss version="2.0"><channel><item><title>T</title><link>https://e.org/x</link><pubDate>yesterday-ish</pubDate></item></channel></rss>`;
    expect(parseFeed(feed).items[0]?.publishedAt).toBeNull();
  });
});

describe('toPlainText', () => {
  it('decodes named and numeric entities', () => {
    expect(toPlainText('AT&amp;T &#8212; &#x201c;quoted&#x201d;')).toBe('AT&T — “quoted”');
  });

  // A script body must never surface as visible words on the page.
  it('drops script and style bodies entirely', () => {
    expect(toPlainText('Before<script>alert(1)</script>After')).toBe('Before After');
    expect(toPlainText('A<style>.x{color:red}</style>B')).toBe('A B');
  });

  it('collapses whitespace introduced by removed markup', () => {
    expect(toPlainText('<p>One</p>\n\n<p>Two</p>')).toBe('One Two');
  });
});

describe('truncateSummary', () => {
  it('leaves a short summary untouched', () => {
    expect(truncateSummary('short', 400)).toBe('short');
  });

  it('cuts at a word boundary and marks the cut', () => {
    const text = `${'word '.repeat(200)}end`;
    const result = truncateSummary(text, 50);
    expect(result.length).toBeLessThanOrEqual(51);
    expect(result.endsWith('…')).toBe(true);
    expect(result).not.toMatch(/wor…$/);
  });

  // CJK has no spaces, so a space-based cut would return almost nothing.
  it('still returns most of the budget for text with no spaces', () => {
    const result = truncateSummary('教育'.repeat(200), 50);
    expect(result.length).toBeGreaterThan(40);
  });
});
