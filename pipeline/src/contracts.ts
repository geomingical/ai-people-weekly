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
  guid: string | null;
}

export interface FeedParseResult {
  items: RawFeedItem[];
  format: 'rss' | 'atom' | 'json' | 'unknown';
  error: string | null;
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
}

export interface SummaryOutcome {
  requested: number;
  succeeded: number;
  failed: number;
  skippedReason: string | null;
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
  warnings: string[];
}

export interface AgentConfig {
  baseUrl: string;
  model: string;
  maxInputChars: number;
  maxOutputTokens: number;
}
