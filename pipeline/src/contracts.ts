// Shared contracts between pipeline stages. Every stage takes and returns
// plain data so each can be tested without a network, a clock, or a model.

/** Result of one SSRF-guarded fetch. Never thrown — always returned. */
export interface FetchResult {
  url: string;
  finalUrl: string;
  status: number | null;
  body: string | null;
  fetchedAt: string;
  error: 'blocked' | 'network' | 'timeout' | 'too-large' | null;
  redirectChain: string[];
}

/** One entry as it appeared in a feed, before any of our processing. */
export interface RawFeedItem {
  title: string;
  link: string;
  /** Short excerpt. This is what gets STORED and SHOWN — "summary and link
   *  only" is what the source registry's licence notes promise. */
  summary: string;
  /**
   * The full post body when the feed shipped one (`content:encoded`, Atom
   * `content`). TRANSIENT: it is handed to the summarizer and discarded, never
   * written to src/data/stories.json and never rendered. Empty when the feed
   * carried only a teaser — the caller then fetches the article page instead.
   */
  fullText: string;
  publishedAt: string | null; // ISO 8601, null when the feed omitted a date

  /**
   * The date exactly as the feed wrote it, before any parsing.
   *
   * This exists because `new Date('2026-08')` succeeds and silently means the
   * first of the month. Cell Press ships month-only dates on issue front
   * matter, and coercing them to day one puts a late-in-the-month article
   * outside a weekly window that only moves further away — the story would
   * disappear permanently and leave no trace. Precision has to be judged
   * before parsing destroys it.
   */
  publishedAtRaw: string;

  /**
   * The DOI the feed carried, uncleaned. Null when it carried none —
   * ScienceDirect and JMIR do not, so those fall back to a title search.
   *
   * Kept raw on purpose: publishers append query strings and punctuation, and
   * one place downstream knows how to strip them. Taylor & Francis appends
   * `?af=R`, and querying with that returns zero hits, which reads exactly
   * like "this paper has no abstract".
   */
  doi: string | null;

  guid: string | null;
}

export interface FeedParseResult {
  items: RawFeedItem[];
  format: 'rss' | 'atom' | 'json' | 'unknown';
  error: string | null;
}

/**
 * One rejected item, kept in full.
 *
 * The histogram alone cannot tell a masthead page from a real study, and by the
 * time a count draws attention the item may have rotated out of the feed. The
 * report is written to disk, so the URL survives even then.
 *
 * Only rare reasons are detailed. `not-relevant` is hundreds of items a week
 * once whole arXiv categories are subscribed; a log nobody reads is not
 * observability, it is a bigger report.
 */
export interface RejectDetail {
  reason: string;
  title: string;
  url: string;
  /** What the feed actually said the date was, before any parsing. */
  rawDate: string;
}

/** What one source contributed to a run, successful or not. */
export interface SourceOutcome {
  sourceId: string;
  feedUrl: string | null;
  status: number | null;
  fetchError: FetchResult['error'];
  parseError: string | null;
  itemsSeen: number;
  itemsInWindow: number;
  itemsAccepted: number;
  itemsRejected: number;
  /** Why items were dropped, so a silent source is diagnosable from the report. */
  rejectCounts: Record<string, number>;
  /** Per-item detail for the rare, worth-looking-at reasons only. */
  rejectDetails: RejectDetail[];
}

/**
 * What a model cost this run.
 *
 * Counting conventions, defined once and shared by every model stage:
 *   call      — one HTTP request to a provider, retries and failovers included.
 *   retry     — a second or later request to the SAME provider for one batch.
 *   failover  — a batch moving to a different provider. Distinct from a retry:
 *               one says the provider is flaky, the other says it is unusable.
 *   failures  — attempts that returned nothing usable.
 *   tokens    — completionTokens summed. Attempts that report no count are
 *               tallied separately rather than counted as zero: NVIDIA returns
 *               no token count with a 503, and treating those as zero would
 *               make the run look cheaper than it was.
 */
export interface ModelUsage {
  calls: number;
  retries: number;
  failovers: number;
  failures: number;
  completionTokens: number;
  tokensUnreported: number;
  byProvider: Record<string, { served: number; failed: number }>;
}

export interface SummaryOutcome {
  requested: number;
  succeeded: number;
  failed: number;
  skippedReason: string | null;
}

/**
 * One candidate and what happened to it.
 *
 * `abstractVia` is added when the enrichment ladder exists.
 */
export interface RunDecision {
  sourceId: string;
  title: string;
  url: string;
  verdict: 'accepted' | 'rejected';
  /** Which rung of the ladder supplied the abstract. */
  abstractVia?: 'feed' | 'openalex' | 'article-page' | 'none';
}

export interface RunReport {
  runAt: string;
  issue: string;
  windowStart: string;
  windowEnd: string;
  outcome: 'completed' | 'completed-with-warnings' | 'failed';
  sources: SourceOutcome[];
  summaries: SummaryOutcome;
  storiesAdded: number;
  storiesTotal: number;
  /** Wall-clock time for the whole run, measured on a monotonic clock. */
  durationMs: number;
  /**
   * How each candidate's abstract was obtained. The only way to tell whether
   * the OpenAlex rung is earning its place, or whether a publisher quietly
   * started shipping abstracts.
   */
  enrichment: { feed: number; openalex: number; articlePage: number; none: number };
  /** What the relevance gate cost. See ModelUsage for the counting rules. */
  classifier: ModelUsage;
  /**
   * Every candidate and what happened to it. **Dry runs only.**
   *
   * A weekly report must not carry hundreds of rows nobody reads; a one-off
   * human review of the gate's judgement needs exactly those rows. Absent —
   * not empty — on a normal run.
   */
  decisions?: RunDecision[];
  warnings: string[];
}

export interface AgentConfig {
  baseUrl: string;
  model: string;
  maxInputChars: number;
  maxOutputTokens: number;
}
