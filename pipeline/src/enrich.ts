// Filling in the abstract the gate needs.
//
// Runs BEFORE relevance, not after, because the editorial rule — was a person
// measured, or a model — cannot be decided from a title, and most of the
// journal feeds carry nothing else.
//
// The ladder is ordered by politeness as well as reliability: use what the
// publisher already handed over, then a public index, and only then ask the
// publisher's own server. A publisher that forbids the third step never gets
// it, whatever the first two returned.

import type { OpenAlexResult } from './openalex';

/**
 * Below this, the text is a citation line rather than an abstract.
 *
 * Measured 2026-08-25: Taylor & Francis ships 7 characters, ACM 91,
 * ScienceDirect 144-173, SAGE 326 (a citation plus a fragment of the first
 * sentence). Real abstracts in these feeds run 543-2,615.
 */
export const MIN_ABSTRACT_CHARS = 400;

export interface EnrichSource {
  id: string;
  abstractStrategy: 'feed' | 'openalex' | 'article-page';
  /** False for every publisher whose robots.txt forbids it. Never override. */
  articlePageAllowed: boolean;
  accessDefault: 'open' | null;
}

export interface EnrichCandidate {
  title: string;
  url: string;
  /**
   * The untruncated text the feed shipped, NOT the published excerpt.
   *
   * summaryOriginal is capped at 400 characters because that is what gets
   * published, and reading the cap instead of the text made every feed
   * abstract look like a citation line.
   */
  feedText: string;
  doi: string | null;
}

export interface EnrichDeps {
  lookup: (options: { doi?: string | null; title?: string }) => Promise<OpenAlexResult>;
  fetchArticle: (url: string) => Promise<string | null>;
}

export interface Enriched {
  abstract: string | null;
  via: 'feed' | 'openalex' | 'article-page' | 'none';
  access: 'open' | 'restricted' | 'unknown';
  openUrl: string | null;
}

const usable = (text: string | null | undefined): boolean =>
  typeof text === 'string' && text.trim().length >= MIN_ABSTRACT_CHARS;

export async function enrichCandidate(
  candidate: EnrichCandidate,
  source: EnrichSource,
  deps: EnrichDeps,
): Promise<Enriched> {
  const fromFeed = candidate.feedText.trim();
  const alwaysOpen = source.accessDefault === 'open';

  // Nothing to ask anyone: the feed carried the abstract and the venue is
  // known to be free.
  if (usable(fromFeed) && alwaysOpen) {
    return { abstract: fromFeed, via: 'feed', access: 'open', openUrl: null };
  }

  const openAlex = await deps.lookup({ doi: candidate.doi, title: candidate.title });

  // A venue declared always-open needs no per-article answer, and OpenAlex not
  // knowing about a brand-new paper must not turn a free journal into
  // "unverified".
  const access = alwaysOpen ? 'open' : openAlex.access;
  const openUrl = alwaysOpen ? null : openAlex.openUrl;

  if (usable(fromFeed)) return { abstract: fromFeed, via: 'feed', access, openUrl };
  if (usable(openAlex.abstract)) {
    return { abstract: openAlex.abstract!.trim(), via: 'openalex', access, openUrl };
  }

  // Third rung. Gated on the publisher's own rules, never on convenience.
  if (source.articlePageAllowed) {
    const page = await deps.fetchArticle(candidate.url);
    if (usable(page)) return { abstract: page!.trim(), via: 'article-page', access, openUrl };
  }

  return { abstract: null, via: 'none', access, openUrl };
}
