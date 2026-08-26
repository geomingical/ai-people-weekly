// OpenAlex: abstracts and open-access status, in one call.
//
// This is load-bearing, not decorative. Seventeen of the twenty-eight journals
// ship feeds with no abstract at all — Taylor & Francis sends seven characters
// of volume and page numbers — and the relevance gate cannot decide "was a
// person measured, or a model" from a title. Without this module those
// journals cannot be published at all.
//
// No `mailto` parameter. OpenAlex invites one for its polite pool, but that
// would put Ming's email in a third party's logs for a benefit he did not ask
// for.

const BASE = 'https://api.openalex.org/works';
const USER_AGENT = 'ai-people-weekly/0.1 (+https://geomingical.github.io/ai-people-weekly)';

/** Below this a title search is too likely to match the wrong paper. */
const MIN_TITLE_CHARS = 15;

/**
 * OpenAlex reads `?` and `*` in title.search as wildcards and answers HTTP 400,
 * and other punctuation confuses its query parser. Academic titles are full of
 * question marks — "Are humans able to discriminate between real and deepfake
 * faces?" returned 400 every time until this existed, and the failure looked
 * exactly like "this paper has no abstract".
 *
 * The index is stemmed, so dropping punctuation costs nothing. The exact-match
 * check in readResult still runs against the untouched title.
 */
function searchTerm(title: string): string {
  return title
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface OpenAlexResult {
  found: boolean;
  abstract: string | null;
  access: 'open' | 'restricted' | 'unknown';
  openUrl: string | null;
}

const NOT_FOUND: OpenAlexResult = {
  found: false,
  abstract: null,
  access: 'unknown',
  openUrl: null,
};

/**
 * A DOI as the publisher wrote it is not a DOI you can query with.
 *
 * Taylor & Francis appends `?af=R`; others append fragments, or a trailing full
 * stop picked up from surrounding prose. Querying with those returns zero hits,
 * which is indistinguishable from "this paper has no abstract" — during the
 * research pass it produced a 16% hit rate that was really 76%.
 */
export function cleanDoi(raw: string | null): string | null {
  if (!raw) return null;
  const stripped = raw
    .trim()
    .replace(/^doi:/i, '')
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  if (!/^10\.\d{4,}\/\S+$/.test(stripped)) return null;
  const withoutQuery = stripped.split(/[?#]/)[0] ?? '';
  const cleaned = withoutQuery.replace(/[.,;)\]]+$/, '');
  return cleaned.length > 0 ? cleaned : null;
}

/** OpenAlex stores abstracts as {word: [positions]}. Rebuild the prose. */
export function invertedToText(
  index: Record<string, number[]> | undefined | null,
): string | null {
  if (!index) return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions) words[position] = word;
  }
  const text = [...words].filter((word) => word !== undefined).join(' ').trim();
  return text.length > 0 ? text : null;
}

const normalize = (value: string | null | undefined): string =>
  (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

interface Work {
  title?: string | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  open_access?: { is_oa?: boolean; oa_status?: string | null; oa_url?: string | null } | null;
}

/**
 * Turns OpenAlex results into a verdict.
 *
 * A DOI query is trusted. A title query is not: OpenAlex will happily return a
 * near miss, and attaching another paper's abstract to a story would put words
 * in a researcher's mouth on a site that publishes without review.
 */
export function readResult(
  results: readonly Work[],
  doi: string | null,
  title: string,
): OpenAlexResult {
  const matches = doi
    ? results
    : results.filter((work) => normalize(work.title) === normalize(title));
  if (matches.length === 0) return NOT_FOUND;

  const withAbstract = matches.find((work) => work.abstract_inverted_index) ?? matches[0]!;
  // A preprint and the journal version are separate works. What the reader
  // wants to know is whether ANY version can be read for free.
  const free = matches.find((work) => work.open_access?.is_oa === true);

  return {
    found: true,
    abstract: invertedToText(withAbstract.abstract_inverted_index),
    access: free ? 'open' : 'restricted',
    openUrl: free?.open_access?.oa_url ?? null,
  };
}

export interface LookupOptions {
  doi?: string | null;
  title?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Never throws. A lookup failure is 'unknown', not a lost run. */
export async function lookup(options: LookupOptions): Promise<OpenAlexResult> {
  const doi = cleanDoi(options.doi ?? null);
  const title = options.title ?? '';
  if (!doi && title.length < MIN_TITLE_CHARS) return NOT_FOUND;

  const url = doi
    ? `${BASE}?per-page=3&filter=doi:${encodeURIComponent(doi)}`
    : `${BASE}?per-page=3&filter=title.search:${encodeURIComponent(searchTerm(title).slice(0, 150))}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
  try {
    const response = await (options.fetchImpl ?? fetch)(url, {
      headers: { 'user-agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!response.ok) return NOT_FOUND;
    const body = (await response.json()) as { results?: Work[] };
    return readResult(body.results ?? [], doi, title);
  } catch {
    return NOT_FOUND;
  } finally {
    clearTimeout(timer);
  }
}
