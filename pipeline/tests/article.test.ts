import { describe, expect, it } from 'vitest';
import {
  MAX_ARTICLE_CHARS,
  MIN_USABLE_CHARS,
  createHostPacer,
  extractArticleText,
  fetchArticleText,
} from '../src/article';
import type { FetchIO } from '../src/fetcher';

function page(body: string, head = ''): string {
  return `<html><head><title>Page</title>${head}</head><body>${body}</body></html>`;
}

const realBody = '<p>' + 'The district piloted an AI tutor across twelve schools this term. '.repeat(20) + '</p>';

describe('extractArticleText', () => {
  it('pulls the article body out of a full page', () => {
    const text = extractArticleText(page(`<article><h1>Head</h1>${realBody}</article>`), 'https://e.org/a');
    expect(text).not.toBeNull();
    expect(text).toContain('piloted an AI tutor');
  });

  // Navigation, ads, and footers are what make a naive "strip the tags"
  // approach summarize furniture instead of the article.
  it('drops navigation and footer chrome', () => {
    const text = extractArticleText(
      page(
        `<nav>Home Sections Subscribe Newsletter Account</nav>
         <article><h1>Head</h1>${realBody}</article>
         <footer>Copyright notice and social links</footer>`,
      ),
      'https://e.org/a',
    );
    expect(text).toContain('piloted an AI tutor');
    expect(text).not.toContain('Subscribe');
    expect(text).not.toContain('Copyright notice');
  });

  it('never returns script or style contents as words', () => {
    const text = extractArticleText(
      page(`<article>${realBody}<script>var leak="SECRET"</script><style>.x{color:red}</style></article>`),
      'https://e.org/a',
    );
    expect(text).not.toContain('SECRET');
    expect(text).not.toContain('color:red');
  });

  // A paywall or cookie wall leaves a stub. Summarizing a stub is worse than
  // falling back to the feed's own excerpt.
  it.each([
    ['a paywall stub', '<article><p>Subscribe to continue reading.</p></article>'],
    ['an empty body', ''],
    ['a script-rendered shell', '<div id="root"></div>'],
  ])('returns null for %s', (_label, body) => {
    expect(extractArticleText(page(body), 'https://e.org/a')).toBeNull();
  });

  it('returns null rather than throwing on malformed HTML', () => {
    expect(extractArticleText('<<<not html', 'https://e.org/a')).toBeNull();
  });

  // Bounded input is an injection defence: a hostile page must not get to
  // choose how large the prompt is.
  it('caps a very long article', () => {
    const huge = page(`<article><p>${'word '.repeat(200_000)}</p></article>`);
    const text = extractArticleText(huge, 'https://e.org/a');
    expect(text?.length).toBeLessThanOrEqual(MAX_ARTICLE_CHARS);
  });

  it('treats anything under the usable floor as no article', () => {
    const text = extractArticleText(page(`<article><p>${'x'.repeat(MIN_USABLE_CHARS - 50)}</p></article>`), 'https://e.org/a');
    expect(text).toBeNull();
  });
});

describe('fetchArticleText', () => {
  function io(overrides: Partial<FetchIO> = {}): FetchIO {
    return {
      fetch: async () => new Response(page(`<article><h1>H</h1>${realBody}</article>`), { status: 200 }),
      resolve: async () => ['93.184.216.34'],
      now: () => new Date('2026-08-19T00:00:00Z'),
      ...overrides,
    };
  }

  it('returns the extracted text on a good page', async () => {
    const result = await fetchArticleText('https://example.org/a', ['example.org'], io());
    expect(result.error).toBeNull();
    expect(result.text).toContain('piloted an AI tutor');
  });

  // The same SSRF guard as the feeds: an article link that left the source's
  // own domains was already rejected at ingest, and is refused again here.
  it('refuses a host outside the source’s official domains', async () => {
    const result = await fetchArticleText('https://evil.test/a', ['example.org'], io());
    expect(result.text).toBeNull();
    expect(result.error).toMatch(/blocked/);
  });

  it.each([
    ['a 404', 404],
    ['a 500', 500],
  ])('reports %s without throwing', async (_label, status) => {
    const result = await fetchArticleText('https://example.org/a', ['example.org'], io({
      fetch: async () => new Response('nope', { status }),
    }));
    expect(result.text).toBeNull();
    expect(result.status).toBe(status);
  });

  it('reports a network failure without throwing', async () => {
    const result = await fetchArticleText('https://example.org/a', ['example.org'], io({
      fetch: async () => {
        throw new Error('ECONNRESET');
      },
    }));
    expect(result.text).toBeNull();
    expect(result.error).toMatch(/network/);
  });

  it('reports a page it cannot extract, so the caller can fall back', async () => {
    const result = await fetchArticleText('https://example.org/a', ['example.org'], io({
      fetch: async () => new Response(page('<div id="root"></div>'), { status: 200 }),
    }));
    expect(result.text).toBeNull();
    expect(result.error).toMatch(/no readable article text/);
  });
});

describe('createHostPacer', () => {
  function pacer(delayMs = 10_000) {
    const slept: number[] = [];
    let clock = 0;
    const pace = createHostPacer(delayMs, async (ms) => {
      slept.push(ms);
      clock += ms;
    });
    return { pace, slept, now: () => clock, tick: (ms: number) => { clock += ms; } };
  }

  it('does not wait before the first request to a host', async () => {
    const p = pacer();
    await p.pace('https://a.test/1', p.now);
    expect(p.slept).toEqual([]);
  });

  // Crawl-delay is a rule about one server, not a global speed limit. Waiting
  // between different sites is slower without being more polite to anyone.
  it('does not wait between different hosts', async () => {
    const p = pacer();
    await p.pace('https://a.test/1', p.now);
    await p.pace('https://b.test/1', p.now);
    await p.pace('https://c.test/1', p.now);
    expect(p.slept).toEqual([]);
  });

  it('waits the full delay between back-to-back requests to one host', async () => {
    const p = pacer(10_000);
    await p.pace('https://a.test/1', p.now);
    await p.pace('https://a.test/2', p.now);
    expect(p.slept).toEqual([10_000]);
  });

  // Time already spent fetching counts toward the delay.
  it('waits only the remainder when work already took time', async () => {
    const p = pacer(10_000);
    await p.pace('https://a.test/1', p.now);
    p.tick(6_000);
    await p.pace('https://a.test/2', p.now);
    expect(p.slept).toEqual([4_000]);
  });

  it('does not wait at all when the delay has already elapsed', async () => {
    const p = pacer(10_000);
    await p.pace('https://a.test/1', p.now);
    p.tick(15_000);
    await p.pace('https://a.test/2', p.now);
    expect(p.slept).toEqual([]);
  });

  it('treats subdomains as separate hosts', async () => {
    const p = pacer();
    await p.pace('https://news.a.test/1', p.now);
    await p.pace('https://blog.a.test/1', p.now);
    expect(p.slept).toEqual([]);
  });

  it('ignores an unparseable URL rather than throwing', async () => {
    const p = pacer();
    await expect(p.pace('not a url', p.now)).resolves.toBeUndefined();
  });
});
