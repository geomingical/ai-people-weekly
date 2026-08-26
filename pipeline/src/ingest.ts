// Feed items -> validated story records.
//
// This is the gate between untrusted feed content and the published site.
// Because publishing is automatic, everything rejected here is something a
// reader will never see, and everything accepted goes live unread. The rules
// are therefore deliberately strict and deliberately boring.

import { createHash } from 'node:crypto';
import type { RawFeedItem, RejectDetail } from './contracts';
import { resolveTopics, type Topic } from './classify';
import { resolvePublishedAt, type DateStrategy } from './published-at';

export interface IngestSource {
  id: string;
  officialDomains: readonly string[];
  relevanceMode: 'always' | 'keyword';
  defaultTopics: readonly Topic[];
  maxPerRun: number;
  region: string;
  language: 'en' | 'zh-tw' | 'zh-cn' | 'other';
  /** Where this publisher writes its date. See published-at.ts. */
  dateStrategy: DateStrategy;
}

export interface IngestedItem {
  id: string;
  sourceId: string;
  title: string;
  /** Short excerpt: this is the only body text that ever reaches the site. */
  summaryOriginal: string;
  /**
   * The article body, when the feed shipped one. TRANSIENT — run.ts must not
   * copy this onto the story record. It exists to be read by the model once
   * and then dropped. Empty means the caller should fetch the article page.
   */
  fullText: string;
  url: string;
  publishedAt: string;
  topics: Topic[];
  region: string;
  language: IngestSource['language'];
}

export const REJECT_REASONS = [
  'no-title',
  'bad-url',
  'off-domain',
  'no-date',
  'imprecise-date',
  'future-dated',
  'outside-window',
  'not-relevant',
  'undecided',
  'no-abstract',
  'duplicate',
  'over-cap',
] as const;

export type RejectReason = (typeof REJECT_REASONS)[number];

export type RejectCounts = Partial<Record<RejectReason, number>>;

export interface IngestResult {
  accepted: IngestedItem[];
  rejected: RejectDetail[];
  /** Reason histogram, so a source that suddenly contributes nothing shows
   *  WHY in the run report instead of just showing a zero. */
  rejectCounts: RejectCounts;
}

/** Stable per-article id: the same URL always yields the same record. */
export function storyId(url: string): string {
  return createHash('sha256').update(canonicalUrl(url)).digest('hex').slice(0, 16);
}

// Tracking parameters make the same article look like several different ones
// across feeds and across weeks. Stripping them is what makes the id stable
// and de-duplication actually work.
const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'utm_id', 'utm_name', 'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref', 'source',
];

export function canonicalUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return rawUrl.trim();
  }
  for (const param of TRACKING_PARAMS) parsed.searchParams.delete(param);
  parsed.hash = '';
  parsed.hostname = parsed.hostname.toLowerCase();
  // A trailing slash is not a different article.
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }
  return parsed.toString();
}

function hostAllowed(rawUrl: string, allowedDomains: readonly string[]): boolean {
  let hostname: string;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    hostname = parsed.hostname.toLowerCase();
  } catch {
    return false;
  }
  return allowedDomains.some(
    (domain) => hostname === domain.toLowerCase() || hostname.endsWith(`.${domain.toLowerCase()}`),
  );
}

export interface IngestWindow {
  /** Inclusive lower bound: items published before this are outside the run. */
  start: Date;
  /** Exclusive upper bound, normally "now". */
  end: Date;
}

// A feed may legitimately be a few hours ahead of the runner's clock. Anything
// beyond this is a data error, not a timezone: the research pass found one
// outlet shipping items dated weeks into the future, and an automatic
// publisher must not let that create an issue for a week that has not happened.
const FUTURE_TOLERANCE_MS = 6 * 60 * 60 * 1000;

/**
 * A candidate that passed every deterministic gate and is waiting on a
 * relevance verdict. Carries the raw feed item so a classifier can read it.
 */
export interface Candidate {
  item: IngestedItem;
  raw: RawFeedItem;
}

export interface ScreenResult {
  candidates: Candidate[];
  /** Detail for the rare reasons only — see RejectDetail. */
  rejected: RejectDetail[];
  rejectCounts: RejectCounts;
}

/**
 * Reasons worth keeping per item.
 *
 * These should be zero or nearly zero. When one is not, the count alone cannot
 * say whether a masthead page or a real study was lost. The high-volume
 * reasons stay as counts.
 */
export const DETAILED_REJECT_REASONS: ReadonlySet<string> = new Set([
  'no-date',
  'imprecise-date',
  'future-dated',
  'no-abstract',
]);

/**
 * Everything that can be decided without judgement: a title, an https link on
 * the source's own domain, a real publication date inside the window and not in
 * the future, and not already published.
 *
 * Relevance and the per-source cap are NOT applied here. They come after,
 * because the cap should count stories worth publishing rather than stories
 * that happened to be checked first, and because a model-based relevance
 * verdict is asynchronous and batched.
 */
export function screenSourceItems(
  source: Omit<IngestSource, 'relevanceMode' | 'maxPerRun'>,
  items: readonly RawFeedItem[],
  window: IngestWindow,
  seenIds: Set<string>,
): ScreenResult {
  const candidates: Candidate[] = [];
  const rejected: ScreenResult['rejected'] = [];
  const rejectCounts: RejectCounts = {};

  const reject = (reason: RejectReason, title: string, url = '', rawDate = '') => {
    rejectCounts[reason] = (rejectCounts[reason] ?? 0) + 1;
    if (DETAILED_REJECT_REASONS.has(reason)) {
      rejected.push({ reason, title: title.slice(0, 200), url, rawDate });
    }
  };

  // Screening does not mark ids as seen — relevance and the cap may still turn
  // a candidate away, and one turned away today must stay eligible next week.
  // Duplicates WITHIN this batch still have to collapse, so they are tracked
  // separately and discarded when the pass ends.
  const seenInThisBatch = new Set<string>();

  const ordered = [...items].sort((left, right) => {
    const leftTime = left.publishedAt ? Date.parse(left.publishedAt) : 0;
    const rightTime = right.publishedAt ? Date.parse(right.publishedAt) : 0;
    return rightTime - leftTime;
  });

  for (const item of ordered) {
    const title = item.title.trim();
    if (title.length === 0) {
      reject('no-title', '(untitled)');
      continue;
    }

    const url = item.link.trim();
    if (!url.startsWith('https://')) {
      reject('bad-url', title);
      continue;
    }
    if (!hostAllowed(url, source.officialDomains)) {
      reject('off-domain', title);
      continue;
    }

    // Each publisher writes the date somewhere different, and one writes it in
    // prose. Month-only values are rejected rather than guessed — see
    // published-at.ts for why guessing loses the story permanently.
    const resolved = resolvePublishedAt(source.dateStrategy, item);
    if (resolved.precision === 'month') {
      reject('imprecise-date', title, url, resolved.rawValue);
      continue;
    }
    if (resolved.iso === null) {
      reject('no-date', title, url, resolved.rawValue);
      continue;
    }
    const published = new Date(resolved.iso);
    if (published.getTime() > window.end.getTime() + FUTURE_TOLERANCE_MS) {
      reject('future-dated', title, url, resolved.rawValue);
      continue;
    }
    if (published.getTime() < window.start.getTime()) {
      reject('outside-window', title);
      continue;
    }

    const id = storyId(url);
    if (seenIds.has(id) || seenInThisBatch.has(id)) {
      reject('duplicate', title);
      continue;
    }
    seenInThisBatch.add(id);

    candidates.push({
      raw: item,
      item: {
        id,
        sourceId: source.id,
        title,
        summaryOriginal: item.summary.trim(),
        fullText: item.fullText,
        url: canonicalUrl(url),
        publishedAt: published.toISOString(),
        // Filled in by the relevance stage; never left empty on an accepted story.
        topics: [],
        region: source.region,
        language: source.language,
      },
    });
  }

  return { candidates, rejected, rejectCounts };
}

/** A relevance verdict for one candidate, however it was reached. */
export interface RelevanceVerdict {
  relevant: boolean;
  topics: readonly Topic[];
  /**
   * The model gave no usable answer, so this is an outage rather than a
   * judgement. Recorded under its own reason: filing an outage as
   * `not-relevant` would make a week the model was down look like a quiet week.
   */
  undecided?: boolean;
}

/**
 * Applies verdicts and the per-source cap, newest first.
 *
 * The cap lands here rather than in screening so it counts stories worth
 * publishing: a feed of fifty irrelevant items no longer consumes the budget
 * before a relevant one is reached.
 */
export function acceptCandidates(
  candidates: readonly Candidate[],
  verdictFor: (candidate: Candidate) => RelevanceVerdict,
  maxPerRun: number,
  seenIds: Set<string>,
): IngestResult {
  const accepted: IngestedItem[] = [];
  const rejected: IngestResult['rejected'] = [];
  const rejectCounts: RejectCounts = {};

  const reject = (reason: RejectReason, candidate: Candidate) => {
    rejectCounts[reason] = (rejectCounts[reason] ?? 0) + 1;
    if (DETAILED_REJECT_REASONS.has(reason)) {
      rejected.push({
        reason,
        title: candidate.item.title.slice(0, 200),
        url: candidate.item.url,
        rawDate: candidate.raw.publishedAtRaw,
      });
    }
  };

  for (const candidate of candidates) {
    const verdict = verdictFor(candidate);
    if (verdict.undecided === true) {
      reject('undecided', candidate);
      continue;
    }
    if (!verdict.relevant) {
      reject('not-relevant', candidate);
      continue;
    }
    if (accepted.length >= maxPerRun) {
      reject('over-cap', candidate);
      continue;
    }
    seenIds.add(candidate.item.id);
    accepted.push({ ...candidate.item, topics: [...verdict.topics] });
  }

  return { accepted, rejected, rejectCounts };
}

/**
 * Screen and accept in one call, with no model available.
 *
 * There is no keyword fallback. A `keyword` source whose candidates never
 * reached a model is undecided, not irrelevant, and undecided means unpublished
 * — this site puts stories live without anyone reading them, so a week with
 * fewer stories is a small loss and a week of unvetted papers is not.
 */
export function ingestSourceItems(
  source: IngestSource,
  items: readonly RawFeedItem[],
  window: IngestWindow,
  seenIds: Set<string>,
): IngestResult {
  const screened = screenSourceItems(source, items, window, seenIds);

  const accepted = acceptCandidates(
    screened.candidates,
    (candidate) => {
      if (source.relevanceMode === 'always') {
        return { relevant: true, topics: resolveTopics(candidate.raw, source.defaultTopics) };
      }
      return { relevant: false, topics: [], undecided: true };
    },
    source.maxPerRun,
    seenIds,
  );

  return {
    accepted: accepted.accepted,
    rejected: [...screened.rejected, ...accepted.rejected],
    rejectCounts: { ...screened.rejectCounts, ...accepted.rejectCounts },
  };
}
