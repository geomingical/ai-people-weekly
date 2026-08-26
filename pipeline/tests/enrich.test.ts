import { describe, expect, it, vi } from 'vitest';
import { MIN_ABSTRACT_CHARS, enrichCandidate, type EnrichSource } from '../src/enrich';

const long = (n: number) => 'x'.repeat(n);

const source = (over: Partial<EnrichSource> = {}): EnrichSource => ({
  id: 's',
  abstractStrategy: 'openalex',
  articlePageAllowed: false,
  accessDefault: null,
  ...over,
});

const candidate = (over: Record<string, unknown> = {}) => ({
  title: 'A study of companion chatbots and loneliness',
  url: 'https://example.org/a',
  feedText: '',
  doi: null,
  ...over,
});

const noOpenAlex = { found: false, abstract: null, access: 'unknown' as const, openUrl: null };

describe('enrichCandidate', () => {
  it('uses the feed abstract and makes no network call when it is long enough', async () => {
    const lookup = vi.fn();
    const result = await enrichCandidate(
      candidate({ feedText: long(MIN_ABSTRACT_CHARS) }),
      source({ accessDefault: 'open' }),
      { lookup, fetchArticle: vi.fn() },
    );
    expect(result.via).toBe('feed');
    expect(result.access).toBe('open');
    expect(lookup).not.toHaveBeenCalled();
  });

  // Taylor & Francis ships seven characters of volume and page numbers.
  it('falls back to OpenAlex when the feed abstract is too short', async () => {
    const lookup = vi.fn().mockResolvedValue({
      found: true,
      abstract: long(900),
      access: 'open',
      openUrl: 'https://free/pdf',
    });
    const result = await enrichCandidate(
      candidate({ feedText: 'Volume 42, Issue 16' }),
      source(),
      { lookup, fetchArticle: vi.fn() },
    );
    expect(result.via).toBe('openalex');
    expect(result.access).toBe('open');
    expect(result.openUrl).toBe('https://free/pdf');
  });

  it('falls back to the article page only when the publisher permits it', async () => {
    const lookup = vi.fn().mockResolvedValue(noOpenAlex);
    const fetchArticle = vi.fn().mockResolvedValue(long(800));
    const result = await enrichCandidate(
      candidate(),
      source({ abstractStrategy: 'article-page', articlePageAllowed: true }),
      { lookup, fetchArticle },
    );
    expect(result.via).toBe('article-page');
    expect(fetchArticle).toHaveBeenCalledOnce();
  });

  // The single most important test here. ScienceDirect returns 403 on
  // robots.txt and asserts tdm-reservation.
  it('never fetches an article page from a publisher that forbids it', async () => {
    const lookup = vi.fn().mockResolvedValue(noOpenAlex);
    const fetchArticle = vi.fn();
    const result = await enrichCandidate(candidate(), source({ articlePageAllowed: false }), {
      lookup,
      fetchArticle,
    });
    expect(fetchArticle).not.toHaveBeenCalled();
    expect(result.via).toBe('none');
    expect(result.abstract).toBeNull();
  });

  it('uses the source default for venues that are always free', async () => {
    const lookup = vi.fn().mockResolvedValue(noOpenAlex);
    const result = await enrichCandidate(
      candidate({ feedText: long(900) }),
      source({ accessDefault: 'open' }),
      { lookup, fetchArticle: vi.fn() },
    );
    expect(result.access).toBe('open');
    expect(lookup).not.toHaveBeenCalled();
  });

  // A feed abstract still needs the access status looked up when the journal
  // is hybrid, or every hybrid article would show as unverified.
  it('looks up access even when the feed carried the abstract', async () => {
    const lookup = vi.fn().mockResolvedValue({
      found: true,
      abstract: null,
      access: 'restricted',
      openUrl: null,
    });
    const result = await enrichCandidate(
      candidate({ feedText: long(900) }),
      source({ accessDefault: null }),
      { lookup, fetchArticle: vi.fn() },
    );
    expect(result.via).toBe('feed');
    expect(result.access).toBe('restricted');
    expect(lookup).toHaveBeenCalledOnce();
  });

  it('reports unknown access rather than guessing when the lookup found nothing', async () => {
    const result = await enrichCandidate(
      candidate({ feedText: long(900) }),
      source(),
      { lookup: vi.fn().mockResolvedValue(noOpenAlex), fetchArticle: vi.fn() },
    );
    expect(result.access).toBe('unknown');
    expect(result.openUrl).toBeNull();
  });
});
