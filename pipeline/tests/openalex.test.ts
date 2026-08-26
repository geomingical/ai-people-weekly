import { describe, expect, it } from 'vitest';
import { cleanDoi, invertedToText, lookup, readResult } from '../src/openalex';

describe('cleanDoi', () => {
  // The real string Taylor & Francis puts in its feed. Querying with the query
  // string attached returns zero hits, which looks exactly like "no abstract
  // exists" — it produced a measured hit rate of 16% that was really 76%.
  it('strips the query string publishers append', () => {
    expect(cleanDoi('10.1080/10447318.2025.2598113?af=R')).toBe('10.1080/10447318.2025.2598113');
  });

  it('strips a fragment', () => {
    expect(cleanDoi('10.1145/3803855#sec1')).toBe('10.1145/3803855');
  });

  it('strips trailing punctuation picked up from prose', () => {
    expect(cleanDoi('10.1177/14614448251346201.')).toBe('10.1177/14614448251346201');
  });

  it('strips a doi: prefix and a resolver URL', () => {
    expect(cleanDoi('doi:10.1038/s41562-026-02558-6')).toBe('10.1038/s41562-026-02558-6');
    expect(cleanDoi('https://doi.org/10.2196/12345')).toBe('10.2196/12345');
  });

  it('returns null for anything that is not a DOI', () => {
    expect(cleanDoi('https://example.org/article')).toBeNull();
    expect(cleanDoi(null)).toBeNull();
    expect(cleanDoi('')).toBeNull();
  });
});

describe('invertedToText', () => {
  it('rebuilds a sentence from the inverted index', () => {
    expect(invertedToText({ Sycophantic: [0], AI: [1], reduces: [2], repair: [3] }))
      .toBe('Sycophantic AI reduces repair');
  });

  it('handles a word that appears twice', () => {
    expect(invertedToText({ the: [0, 2], cat: [1], hat: [3] })).toBe('the cat the hat');
  });

  it('returns null when there is no index', () => {
    expect(invertedToText(undefined)).toBeNull();
    expect(invertedToText(null)).toBeNull();
  });
});

describe('readResult', () => {
  const work = (over: Record<string, unknown> = {}) => ({
    title: 'Sycophantic AI decreases prosocial intentions',
    abstract_inverted_index: { Across: [0], four: [1], experiments: [2] },
    open_access: { is_oa: true, oa_status: 'gold', oa_url: 'https://example.org/pdf' },
    ...over,
  });

  it('reports an open article with its free link', () => {
    const r = readResult([work()], null, 'Sycophantic AI decreases prosocial intentions');
    expect(r).toMatchObject({ found: true, access: 'open', openUrl: 'https://example.org/pdf' });
    expect(r.abstract).toBe('Across four experiments');
  });

  it('reports restricted when nothing free was found', () => {
    const r = readResult(
      [work({ open_access: { is_oa: false, oa_status: 'closed', oa_url: null } })],
      '10.1/x',
      'anything',
    );
    expect(r.access).toBe('restricted');
    expect(r.openUrl).toBeNull();
  });

  it('is unknown when OpenAlex has no record at all', () => {
    expect(readResult([], '10.1/x', 'anything')).toMatchObject({ found: false, access: 'unknown' });
  });

  // A preprint and the journal version arrive as separate works. What a reader
  // wants to know is whether ANY version can be read for free.
  it('treats the article as open when any matching version is free', () => {
    const closed = work({ open_access: { is_oa: false, oa_status: 'closed', oa_url: null } });
    const green = work({
      abstract_inverted_index: undefined,
      open_access: { is_oa: true, oa_status: 'green', oa_url: 'https://repo/pdf' },
    });
    const r = readResult([closed, green], '10.1/x', 'anything');
    expect(r.access).toBe('open');
    expect(r.openUrl).toBe('https://repo/pdf');
    expect(r.abstract).toBe('Across four experiments');
  });

  // A title search will happily return a near miss. Attaching another paper's
  // abstract would put words in a researcher's mouth on a site nobody reviews.
  it('rejects a title-search result whose title does not match', () => {
    expect(readResult([work()], null, 'A completely different paper').found).toBe(false);
  });

  it('accepts a title match that differs only in punctuation and case', () => {
    const r = readResult([work()], null, 'SYCOPHANTIC AI: decreases prosocial intentions!');
    expect(r.found).toBe(true);
  });
});

describe('lookup', () => {
  it('never throws when the network fails', async () => {
    let called = false;
    const r = await lookup({
      doi: '10.1080/10447318.2025.2598113',
      fetchImpl: (async () => {
        called = true;
        throw new TypeError('fetch failed');
      }) as typeof fetch,
    });
    // Without this the test passes vacuously: an unqueryable DOI returns
    // not-found without ever reaching the network.
    expect(called).toBe(true);
    expect(r).toMatchObject({ found: false, access: 'unknown' });
  });

  it('does not query at all with no DOI and a title too short to be safe', async () => {
    let called = false;
    const r = await lookup({
      title: 'short',
      fetchImpl: (async () => {
        called = true;
        return new Response('{}');
      }) as typeof fetch,
    });
    expect(called).toBe(false);
    expect(r.found).toBe(false);
  });

  // OpenAlex answers HTTP 400 when title.search contains ? or *, and academic
  // titles are full of question marks. The failure was indistinguishable from
  // "no abstract exists".
  it('strips the wildcard characters OpenAlex rejects', async () => {
    let seen = '';
    await lookup({
      title: 'Are humans able to discriminate between real and deepfake faces? A review',
      fetchImpl: (async (url: RequestInfo | URL) => {
        seen = decodeURIComponent(String(url));
        return new Response(JSON.stringify({ results: [] }));
      }) as typeof fetch,
    });
    expect(seen).not.toContain('?A review');
    expect(seen).not.toMatch(/faces\?/);
    expect(seen).toContain('deepfake faces A review');
  });

  // Ming's email must not end up in a third party's logs for a benefit he did
  // not ask for.
  it('sends no mailto parameter', async () => {
    let seen = '';
    await lookup({
      doi: '10.1080/10447318.2025.2598113',
      fetchImpl: (async (url: RequestInfo | URL) => {
        seen = String(url);
        return new Response(JSON.stringify({ results: [] }));
      }) as typeof fetch,
    });
    expect(seen).not.toMatch(/mailto/i);
    expect(seen).toContain('doi:');
  });
});
