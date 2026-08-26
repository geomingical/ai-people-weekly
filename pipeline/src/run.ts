// Weekly run orchestrator.
//
//   read registry -> fetch each active feed -> parse -> ingest gate ->
//   summarize (best effort) -> merge into src/data/stories.json -> report
//
// The merge is additive: existing story records are never rewritten, so a
// re-run cannot change what a reader already saw, and a model outage cannot
// strip summaries off stories that already have them.
//
// Known property, not a bug: an already-published item is rejected as a
// duplicate BEFORE it reaches the per-source cap, so it does not consume a cap
// slot. That is what a weekly schedule needs — last week's stories must not
// crowd out this week's — but it means re-running the SAME window twice admits
// a further capful each time. Backfill with one run at the window you want.
//
// Exit code is 0 for a completed or degraded run and 1 only when the run could
// not produce a usable result at all. A single failing feed is not a failure.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { lookup } from 'node:dns/promises';
import { createHostPacer, fetchArticleText } from './article';
import { parseFeed } from './feed-parser';
import { itemsFromSitemap, parseSitemap, selectSitemapEntries } from './sitemap';
import { safeFetch, type FetchIO } from './fetcher';
import {
  acceptCandidates,
  screenSourceItems,
  type Candidate,
  type IngestedItem,
  type IngestSource,
} from './ingest';
import { classifyAll, type ClassifyInput } from './classify-agent';
import { resolveTopics } from './classify';
import { summarizeAll, type SummaryInput } from './summarize/summarizer';
import { buildProviders, type SummarizerConfig } from './summarize/providers';
import type { ProviderConfig } from './summarize/summarizer';
import type {
  ModelUsage,
  RawFeedItem,
  RunDecision,
  RunReport,
  SourceOutcome,
} from './contracts';
import { enrichCandidate, type Enriched } from './enrich';
import { lookup as openAlexLookup, type OpenAlexResult } from './openalex';
import { loadSources, type Source } from '../../src/domain/source';
import { issueLabelFromIso } from '../../src/domain/issue';
import type { Story, Topic } from '../../src/domain/story';

const ROOT = resolve(import.meta.dirname, '../..');
const SOURCES_PATH = resolve(ROOT, 'src/data/sources.json');
const STORIES_PATH = resolve(ROOT, 'src/data/stories.json');
const AGENTS_PATH = resolve(ROOT, 'pipeline/config/agents.json');

/** How far back a weekly run looks. Slightly over a week so a run that slips a
 *  day does not silently drop the stories it would have covered. Override with
 *  `--since <days>` to backfill the archive on a first run. */
const DEFAULT_WINDOW_DAYS = 8;

/** Reads `--since <days>`; falls back to the weekly default on anything else. */
export function parseWindowDays(argv: readonly string[]): number {
  const index = argv.indexOf('--since');
  if (index === -1) return DEFAULT_WINDOW_DAYS;
  const value = Number(argv[index + 1]);
  if (!Number.isFinite(value) || value <= 0 || value > 400) return DEFAULT_WINDOW_DAYS;
  return Math.floor(value);
}

/** Between article-page requests. Several registry sources publish a
 *  Crawl-delay of 10 seconds; this stays on the polite side of all of them. */
const ARTICLE_FETCH_DELAY_MS = 10_000;

/**
 * Everything this run reaches outside its own process.
 *
 * Only these may be replaced in a test. Screening, enrichment, acceptance, the
 * report aggregation and every write run for real — otherwise a green test
 * would only prove the test's own copy of the pipeline works.
 *
 * The network seam is `io`, BELOW safeFetch, not above it. Seaming above would
 * mean the allowlist, the redirect chain and the private-address check never
 * run in a test — exactly the things most worth proving still work. Here the
 * real safeFetch runs and only the socket is fake.
 *
 * Note what is NOT here: SummaryInput assembly, the choice between feed body
 * and excerpt, and the attempt accounting. Those stay in runWeek, where a test
 * can see them.
 */
export interface RunDeps {
  io: FetchIO;
  classify: typeof classifyAll;
  summarize: typeof summarizeAll;
  /**
   * The model providers this run may use.
   *
   * In the seam because the pipeline gates on `providers.length > 0` before it
   * calls either function. Without it a test would silently take the
   * no-provider branch and never reach the fakes at all.
   */
  providers: readonly ProviderConfig[];
  /**
   * Wraps openalex.lookup. Seamed at the lookup, not at the enrichment, so the
   * three-rung ladder in enrich.ts runs for real.
   */
  openAlex: (query: { doi?: string | null; title?: string }) => Promise<OpenAlexResult>;
  /** Wall clock, for the dates that end up in records. */
  now: () => Date;
  /**
   * Milliseconds from an arbitrary origin, for durations only. Separate from
   * `now` because a wall clock can be moved by NTP mid-run, and a duration
   * measured from Date is not testable without freezing real time.
   */
  monotonicNow: () => number;
  /** Injected so the article-page pacer does not make a test wait ten seconds. */
  sleep: (ms: number) => Promise<void>;
}

export interface RunPaths {
  sourcesPath: string;
  storiesPath: string;
}

export interface RunOptions {
  dryRun: boolean;
  windowDays: number;
  paths: RunPaths;
  deps: RunDeps;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const io: FetchIO = {
  fetch: globalThis.fetch,
  resolve: async (hostname) => {
    const records = await lookup(hostname, { all: true });
    return records.map((record) => record.address);
  },
  now: () => new Date(),
};

function log(message: string): void {
  // stdout carries exactly one JSON document (the report), so every human-
  // readable line goes to stderr.
  process.stderr.write(`${message}\n`);
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function readExistingStories(storiesPath: string): Promise<Story[]> {
  try {
    const parsed = await readJson(storiesPath);
    return Array.isArray(parsed) ? (parsed as Story[]) : [];
  } catch {
    // First run: no file yet.
    return [];
  }
}

/**
 * Reject counts add up; they do not replace each other.
 *
 * `duplicate` is produced by both the screening and the acceptance stage, and
 * an object spread would silently drop one of them. Nothing had ever checked
 * the arithmetic, so nothing had noticed.
 */
function mergeCounts(
  left: Record<string, number>,
  right: Record<string, number>,
): Record<string, number> {
  const merged = { ...left };
  for (const [reason, count] of Object.entries(right)) {
    merged[reason] = (merged[reason] ?? 0) + count;
  }
  return merged;
}

/**
 * Turns a provider-attempt chronology into the report's usage block.
 *
 * A retry and a failover are different events: a second request to the same
 * provider for one batch is a retry, a request to a different provider for
 * that batch is a failover. Counting them together would hide which of the two
 * is happening, and they mean different things.
 */
export function summarizeAttempts(
  attempts: readonly { provider: string; batch: number; outcome: string; completionTokens?: number }[],
  isFailure: (outcome: string) => boolean,
): ModelUsage {
  const usage: ModelUsage = {
    calls: attempts.length,
    retries: 0,
    failovers: 0,
    failures: 0,
    completionTokens: 0,
    tokensUnreported: 0,
    byProvider: {},
  };

  const seenPerBatch = new Map<number, { providers: Set<string>; perProvider: Map<string, number> }>();

  for (const attempt of attempts) {
    const failed = isFailure(attempt.outcome);
    if (failed) usage.failures += 1;

    if (typeof attempt.completionTokens === 'number') {
      usage.completionTokens += attempt.completionTokens;
    } else {
      usage.tokensUnreported += 1;
    }

    const bucket = (usage.byProvider[attempt.provider] ??= { served: 0, failed: 0 });
    if (failed) bucket.failed += 1;
    else bucket.served += 1;

    const batch = seenPerBatch.get(attempt.batch) ?? {
      providers: new Set<string>(),
      perProvider: new Map<string, number>(),
    };
    const already = batch.perProvider.get(attempt.provider) ?? 0;
    if (already > 0) usage.retries += 1;
    else if (batch.providers.size > 0) usage.failovers += 1;
    batch.perProvider.set(attempt.provider, already + 1);
    batch.providers.add(attempt.provider);
    seenPerBatch.set(attempt.batch, batch);
  }

  return usage;
}

function sumCounts(counts: Record<string, number>): number {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

function toIngestSource(source: Source): IngestSource {
  return {
    id: source.id,
    officialDomains: source.officialDomains,
    relevanceMode: source.relevanceMode,
    defaultTopics: source.defaultTopics,
    maxPerRun: source.maxPerRun,
    region: source.region,
    language: source.language,
    dateStrategy: source.dateStrategy,
  };
}

/**
 * `maxPerRun` is authored as a per-WEEK budget, because that is the unit the
 * product publishes in. A backfill run covering several weeks must therefore
 * scale it, or a 45-day backfill would admit the same handful of arXiv papers
 * as a single week and leave the archive looking empty.
 */
export function effectiveCap(maxPerRun: number, windowDays: number): number {
  return maxPerRun * Math.max(1, Math.ceil(windowDays / 7));
}

async function collect(
  sources: readonly Source[],
  window: { start: Date; end: Date },
  windowDays: number,
  seenIds: Set<string>,
  deps: RunDeps,
): Promise<{ candidates: { source: Source; candidate: Candidate }[]; outcomes: SourceOutcome[] }> {
  // Sitemap sources read article pages during collection, so they need the same
  // per-host politeness the article stage uses.
  const sitemapPacer = createHostPacer(ARTICLE_FETCH_DELAY_MS, deps.sleep);
  const candidates: { source: Source; candidate: Candidate }[] = [];
  const outcomes: SourceOutcome[] = [];

  for (const source of sources) {
    if (!source.active || source.feedUrl === null) continue;

    log(`fetching ${source.id} …`);
    const fetched = await safeFetch(source.feedUrl, source.officialDomains, deps.io);

    const outcome: SourceOutcome = {
      sourceId: source.id,
      feedUrl: source.feedUrl,
      status: fetched.status,
      fetchError: fetched.error,
      parseError: null,
      itemsSeen: 0,
      itemsInWindow: 0,
      itemsAccepted: 0,
      itemsRejected: 0,
      rejectCounts: {},
      rejectDetails: [],
    };

    if (fetched.error !== null || fetched.body === null) {
      outcomes.push(outcome);
      log(`  ${source.id}: no body (status ${fetched.status}, error ${fetched.error})`);
      continue;
    }

    // A sitemap source needs its pages read before it has items at all; a feed
    // source already carries them. Both end up as the same RawFeedItem shape.
    let parsedItems: RawFeedItem[];
    if (source.feedFormat === 'sitemap') {
      const sitemap = parseSitemap(fetched.body);
      outcome.parseError = sitemap.error;
      if (sitemap.error !== null) {
        outcomes.push(outcome);
        log(`  ${source.id}: parse failed — ${sitemap.error}`);
        continue;
      }
      const selected = selectSitemapEntries(sitemap.entries, {
        urlPattern: source.urlPattern ?? '/',
        windowStart: window.start,
        windowEnd: window.end,
        maxPages: effectiveCap(source.maxPerRun, windowDays),
      });
      log(`  ${source.id}: sitemap lists ${sitemap.entries.length} urls, ${selected.length} in window`);
      const read = await itemsFromSitemap(
        selected,
        source.officialDomains,
        deps.io,
        (url) => sitemapPacer(url, () => Date.now()),
      );
      if (read.pagesFailed > 0) {
        log(`  ${source.id}: ${read.pagesFailed} of ${read.pagesFetched} pages unreadable`);
      }
      parsedItems = read.items;
      outcome.itemsSeen = read.pagesFetched;
    } else {
      const parsed = parseFeed(fetched.body);
      outcome.parseError = parsed.error;
      outcome.itemsSeen = parsed.items.length;

      if (parsed.error !== null) {
        outcomes.push(outcome);
        log(`  ${source.id}: parse failed — ${parsed.error}`);
        continue;
      }
      parsedItems = parsed.items;
    }

    const screened = screenSourceItems(toIngestSource(source), parsedItems, window, seenIds);
    outcome.rejectCounts = screened.rejectCounts as Record<string, number>;
    // Counted from the histogram, not from the detail list: the detail list
    // deliberately holds only the rare reasons, so its length is not the total.
    outcome.itemsRejected = sumCounts(outcome.rejectCounts);
    outcome.rejectDetails = screened.rejected;
    // "In window" means the date check passed — the pool relevance chooses from.
    outcome.itemsInWindow = screened.candidates.length;

    for (const candidate of screened.candidates) candidates.push({ source, candidate });
    outcomes.push(outcome);
    log(`  ${source.id}: ${screened.candidates.length} candidates of ${parsedItems.length} seen`);
  }

  return { candidates, outcomes };
}

/**
 * One weekly run, start to finish, returning the report rather than printing it.
 *
 * This is the seam every later task tests against. main() below does nothing
 * but read argv, build the real dependencies, print, and set an exit code.
 */
export async function runWeek(options: RunOptions): Promise<RunReport> {
  const { dryRun, windowDays, paths, deps } = options;
  const startedAt = deps.monotonicNow();
  const now = deps.now();
  const window = {
    start: new Date(now.getTime() - windowDays * 86_400_000),
    end: now,
  };
  log(`window: ${windowDays} days back from ${now.toISOString()}`);

  const sources = loadSources(await readJson(paths.sourcesPath));
  const existing = await readExistingStories(paths.storiesPath);
  const seenIds = new Set(existing.map((story) => story.id));

  const { candidates, outcomes } = await collect(sources, window, windowDays, seenIds, deps);
  const byOutcome = new Map(outcomes.map((outcome) => [outcome.sourceId, outcome]));
  const warnings: string[] = outcomes
    .filter((outcome) => outcome.fetchError !== null || outcome.parseError !== null)
    .map(
      (outcome) =>
        `${outcome.sourceId}: ${outcome.fetchError ?? outcome.parseError} (status ${outcome.status})`,
    );

  // --- abstracts: obtained before the gate, because the gate reads them ---
  //
  // Seventeen of the twenty-eight journals ship feeds with no abstract at all,
  // and "was a person measured, or a model" cannot be decided from a title. A
  // candidate with no abstract anywhere is dropped here rather than guessed at.
  //
  // This also replaces the education project's separate article-text stage. An
  // abstract obtained here is what the summarizer reads too, so a publisher
  // whose page was already read for the gate is not asked for it twice.
  const articlePacer = createHostPacer(ARTICLE_FETCH_DELAY_MS, deps.sleep);
  const enriched = new Map<string, Enriched>();
  const withAbstract: { source: Source; candidate: Candidate }[] = [];
  const enrichmentCounts = { feed: 0, openalex: 0, articlePage: 0, none: 0 };

  if (candidates.length > 0) log(`obtaining abstracts for ${candidates.length} candidates …`);
  for (const entry of candidates) {
    const { source, candidate } = entry;
    const result = await enrichCandidate(
      {
        title: candidate.item.title,
        url: candidate.item.url,
        // The untruncated feed text, not the published excerpt.
        feedText: candidate.item.fullText || candidate.item.summaryOriginal,
        doi: candidate.raw.doi,
      },
      source,
      {
        lookup: deps.openAlex,
        fetchArticle: async (url) => {
          // Several registry sources publish a Crawl-delay; it is per-host, so
          // this waits only when the previous request went to the same site.
          await articlePacer(url, () => Date.now());
          const article = await fetchArticleText(url, source.officialDomains, deps.io);
          return article.text;
        },
      },
    );

    enriched.set(candidate.item.id, result);
    enrichmentCounts[result.via === 'article-page' ? 'articlePage' : result.via] += 1;

    const outcome = byOutcome.get(source.id);
    if (result.abstract === null) {
      if (outcome) {
        outcome.rejectCounts = mergeCounts(outcome.rejectCounts, { 'no-abstract': 1 });
        outcome.itemsRejected += 1;
        outcome.rejectDetails = [
          ...outcome.rejectDetails,
          {
            reason: 'no-abstract',
            title: candidate.item.title.slice(0, 200),
            url: candidate.item.url,
            rawDate: candidate.raw.publishedAtRaw,
          },
        ];
      }
      continue;
    }
    withAbstract.push(entry);
  }
  log(`  abstracts: ${JSON.stringify(enrichmentCounts)}`);

  // --- relevance: judged by model, and by nothing else ---
  //
  // There is no fallback. The editorial line is whether a person or a model was
  // measured, which no word list can answer, and this site publishes without
  // review. An unanswered candidate waits for a week when the model answers.
  //
  // The date window has already cut the feed items to a few hundred, so this is
  // a handful of batched calls. Doing it here rather than inside screening is
  // what lets the per-source cap count stories worth publishing instead of
  // stories that happened to be checked first.
  const providers = deps.providers;

  const sourceNameById = new Map(sources.map((source) => [source.id, source.name]));

  // `always` sources are not sent: their whole feed is on topic by registration,
  // and asking about them would spend calls to be told yes.
  const needsJudgement = withAbstract.filter(
    (entry) => entry.source.relevanceMode !== 'always',
  );
  const classifyInputs: ClassifyInput[] = needsJudgement.map(({ candidate }) => ({
    id: candidate.item.id,
    title: candidate.raw.title,
    // The abstract the enrichment stage obtained — the whole reason that stage
    // runs before this one.
    excerpt: enriched.get(candidate.item.id)?.abstract ?? candidate.item.summaryOriginal,
    // Free when the feed shipped it; no page is fetched for this.
    body: candidate.item.fullText,
    sourceName: sourceNameById.get(candidate.item.sourceId) ?? candidate.item.sourceId,
  }));

  let classified = new Map<string, { relevant: boolean; topics: readonly string[] }>();
  let undecided = new Set<string>(classifyInputs.map((entry) => entry.id));
  let classifierUsage: ModelUsage = {
    calls: 0, retries: 0, failovers: 0, failures: 0,
    completionTokens: 0, tokensUnreported: 0, byProvider: {},
  };

  if (classifyInputs.length > 0 && providers.length > 0) {
    log(`judging relevance of ${classifyInputs.length} candidates via ${providers.map((p) => p.id).join(' → ')} …`);
    const result = await deps.classify(classifyInputs, providers, { sleep: deps.sleep });
    classified = new Map(
      [...result.decisions].map(([id, decision]) => [
        id,
        { relevant: decision.relevant, topics: decision.topics },
      ]),
    );
    undecided = new Set(result.undecided);
    classifierUsage = summarizeAttempts(result.attempts, (outcome) => outcome !== 'accepted');
    for (const attempt of result.attempts) {
      log(
        `  [${attempt.provider}] classify batch ${attempt.batch + 1} (${attempt.size}): ${attempt.outcome}` +
          ` (${attempt.durationMs}ms${attempt.status ? `, HTTP ${attempt.status}` : ''})`,
      );
    }
    warnings.push(...result.errors.map((error) => `classifier: ${error}`));
    if (result.undecided.length > 0) {
      warnings.push(
        `${result.undecided.length} model-gated candidates were not published: no provider returned a verdict`,
      );
    }
  } else if (classifyInputs.length > 0) {
    warnings.push(
      'no model provider has a key: no model-gated candidate was judged, so none was published',
    );
  }

  // Apply verdicts and the per-source cap, source by source.
  const items: IngestedItem[] = [];

  for (const source of sources) {
    const mine = withAbstract
      .filter((entry) => entry.source.id === source.id)
      .map((entry) => entry.candidate);
    if (mine.length === 0) continue;

    const accepted = acceptCandidates(
      mine,
      (candidate) => {
        if (source.relevanceMode === 'always') {
          return { relevant: true, topics: resolveTopics(candidate.raw, source.defaultTopics) };
        }
        const verdict = classified.get(candidate.item.id);
        if (verdict && !undecided.has(candidate.item.id)) {
          return {
            relevant: verdict.relevant,
            topics: (verdict.topics.length > 0
              ? verdict.topics
              : source.defaultTopics) as readonly Topic[],
          };
        }
        // Fail closed. There is no deterministic fallback for this site's
        // editorial line — "was a person measured, or a model" is not a
        // question a word list can answer — and this site publishes without
        // review. An undecided candidate waits for a week when the model
        // answers, rather than going live unvetted.
        return { relevant: false, topics: [], undecided: true };
      },
      effectiveCap(source.maxPerRun, windowDays),
      seenIds,
    );

    items.push(...accepted.accepted);
    const outcome = byOutcome.get(source.id);
    if (outcome) {
      outcome.itemsAccepted = accepted.accepted.length;
      // Every reason this stage produces — not-relevant, undecided, over-cap —
      // is a high-volume one, so none of them is in the detail list. Counting
      // by its length would report hundreds of gated-out papers as zero.
      outcome.itemsRejected += sumCounts(accepted.rejectCounts as Record<string, number>);
      outcome.rejectCounts = mergeCounts(
        outcome.rejectCounts,
        accepted.rejectCounts as Record<string, number>,
      );
      outcome.rejectDetails = [...outcome.rejectDetails, ...accepted.rejected];
    }
  }
  log(`accepted ${items.length} of ${withAbstract.length} candidates with abstracts`);

  // The article-text stage that used to sit here is gone: the enrichment stage
  // above already obtained the text the summarizer needs, from whichever rung
  // of the ladder the publisher allows, and asking twice would be rude as well
  // as slow.

  // --- summarization (best effort) ---
  const summaryById = new Map<string, { titleZhTW: string; summaryZhTW: string }>();
  let summaries = { requested: 0, succeeded: 0, failed: 0, skippedReason: null as string | null };

  if (items.length === 0) {
    summaries.skippedReason = 'no new stories to summarize';
  } else if (providers.length === 0) {
    // No key at all is a normal local-development state, not an error. Stories
    // still publish, carrying the source's own summary.
    summaries.skippedReason = 'no model provider has a key';
    warnings.push('summarization skipped: no provider key; stories publish with source-verbatim summaries');
  } else {
    const sourceNames = new Map(sources.map((source) => [source.id, source.name]));
    // The model reads the article when we have it and the excerpt otherwise.
    // Neither the article nor this input is stored anywhere.
    const inputs: SummaryInput[] = items.map((item) => ({
      id: item.id,
      title: item.title,
      // The abstract the enrichment stage obtained. Transient: it is read by
      // the model and never written to stories.json.
      summary: enriched.get(item.id)?.abstract ?? item.summaryOriginal,
      sourceName: sourceNames.get(item.sourceId) ?? item.sourceId,
    }));

    log(`summarizing ${inputs.length} stories via ${providers.map((p) => p.id).join(' → ')} …`);
    const result = await deps.summarize(inputs, providers);

    for (const attempt of result.attempts) {
      log(
        `  [${attempt.provider}] batch ${attempt.batch + 1} attempt ${attempt.attempt + 1}: ${attempt.outcome}` +
          ` (${attempt.durationMs}ms${attempt.status ? `, HTTP ${attempt.status}` : ''}` +
          `${attempt.finishReason ? `, finish=${attempt.finishReason}` : ''}` +
          `${attempt.completionTokens ? `, ${attempt.completionTokens} tokens` : ''})`,
      );
    }

    // Which provider actually served the run — the thing you want to know when
    // the primary is having a bad day.
    const served = new Map<string, number>();
    for (const attempt of result.attempts) {
      if (attempt.outcome === 'accepted' || attempt.outcome === 'accepted-with-drops') {
        served.set(attempt.provider, (served.get(attempt.provider) ?? 0) + (attempt.accepted ?? 0));
      }
    }
    for (const [id, n] of served) log(`  ${id} produced ${n} summaries`);
    if (served.size > 1 || (served.size === 1 && !served.has(providers[0]!.id))) {
      warnings.push(
        `summaries came from more than the primary provider: ${[...served].map(([id, n]) => `${id}=${n}`).join(', ')}`,
      );
    }

    for (const output of result.outputs) {
      summaryById.set(output.id, {
        titleZhTW: output.titleZhTW,
        summaryZhTW: output.summaryZhTW,
      });
    }
    summaries = {
      requested: inputs.length,
      succeeded: result.outputs.length,
      failed: result.failures,
      skippedReason: null,
    };
    warnings.push(...result.errors.map((error) => `summarizer: ${error}`));
  }

  // --- build story records ---
  const fetchedAt = now.toISOString();
  const newStories: Story[] = items.map((item) => {
    const machine = summaryById.get(item.id) ?? null;
    return {
      id: item.id,
      sourceId: item.sourceId,
      title: item.title,
      summaryOriginal: item.summaryOriginal,
      titleZhTW: machine?.titleZhTW ?? null,
      summaryZhTW: machine?.summaryZhTW ?? null,
      summarySource: machine
        ? 'machine'
        : item.summaryOriginal.length > 0
          ? 'source-verbatim'
          : 'none',
      url: item.url,
      publishedAt: item.publishedAt,
      fetchedAt,
      issue: issueLabelFromIso(item.publishedAt),
      topics: item.topics,
      region: item.region,
      language: item.language,
      // Obtained during enrichment, in the same call that fetched the abstract.
      access: enriched.get(item.id)?.access ?? 'unknown',
      openUrl: enriched.get(item.id)?.openUrl ?? null,
    };
  });

  const merged = [...existing, ...newStories].sort(
    (left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt),
  );

  const anyFeedSucceeded = outcomes.some(
    (outcome) => outcome.fetchError === null && outcome.parseError === null,
  );
  const report: RunReport = {
    runAt: fetchedAt,
    issue: issueLabelFromIso(fetchedAt),
    windowStart: window.start.toISOString(),
    windowEnd: window.end.toISOString(),
    outcome: !anyFeedSucceeded ? 'failed' : warnings.length > 0 ? 'completed-with-warnings' : 'completed',
    sources: outcomes,
    summaries,
    storiesAdded: newStories.length,
    storiesTotal: merged.length,
    durationMs: Math.round(deps.monotonicNow() - startedAt),
    enrichment: enrichmentCounts,
    classifier: classifierUsage,
    warnings,
  };

  // Dry runs carry the gate's reasoning; a weekly run does not. See RunReport.
  if (dryRun) {
    const acceptedIds = new Set(items.map((item) => item.id));
    report.decisions = candidates.map(({ source, candidate }): RunDecision => ({
      sourceId: source.id,
      title: candidate.item.title,
      url: candidate.item.url,
      verdict: acceptedIds.has(candidate.item.id) ? 'accepted' : 'rejected',
      abstractVia: enriched.get(candidate.item.id)?.via,
    }));
  }

  if (!dryRun) {
    await writeFile(paths.storiesPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
    log(`wrote ${merged.length} stories to ${paths.storiesPath}`);
  } else {
    log('dry run: stories file not written');
  }

  return report;
}

/**
 * The CLI. Reads argv, builds the real dependencies, prints, sets the exit
 * code. Everything else lives in runWeek so it can be tested.
 */
async function main(): Promise<void> {
  const agents = (await readJson(AGENTS_PATH)) as { summarizer: SummarizerConfig };
  const { providers, skipped: providersWithoutKeys } = buildProviders(
    agents.summarizer,
    process.env,
  );
  if (providersWithoutKeys.length > 0) {
    log(`no key for: ${providersWithoutKeys.join(', ')} — those providers are unavailable`);
  }

  const report = await runWeek({
    dryRun: process.argv.includes('--dry-run'),
    windowDays: parseWindowDays(process.argv),
    paths: { sourcesPath: SOURCES_PATH, storiesPath: STORIES_PATH },
    deps: {
      io,
      classify: classifyAll,
      summarize: summarizeAll,
      providers,
      openAlex: openAlexLookup,
      now: () => new Date(),
      monotonicNow: () => performance.now(),
      sleep: delay,
    },
  });

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.outcome === 'failed' ? 1 : 0;
}

// Only run when this file is executed directly. Without this, importing the
// module — which the test suite does — would fire the CLI as a side effect.
const isEntryPoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  main().catch((error: unknown) => {
    log(`pipeline crashed: ${(error as Error).stack ?? String(error)}`);
    process.exitCode = 1;
  });
}
