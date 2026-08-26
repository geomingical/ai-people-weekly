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
import { isEducationRelevant, resolveTopics } from './classify';
import { summarizeAll, type SummaryInput } from './summarize/summarizer';
import { buildProviders, type SummarizerConfig } from './summarize/providers';
import type { RawFeedItem, RunReport, SourceOutcome } from './contracts';
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

async function readExistingStories(): Promise<Story[]> {
  try {
    const parsed = await readJson(STORIES_PATH);
    return Array.isArray(parsed) ? (parsed as Story[]) : [];
  } catch {
    // First run: no file yet.
    return [];
  }
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
): Promise<{ candidates: { source: Source; candidate: Candidate }[]; outcomes: SourceOutcome[] }> {
  // Sitemap sources read article pages during collection, so they need the same
  // per-host politeness the article stage uses.
  const sitemapPacer = createHostPacer(ARTICLE_FETCH_DELAY_MS, delay);
  const candidates: { source: Source; candidate: Candidate }[] = [];
  const outcomes: SourceOutcome[] = [];

  for (const source of sources) {
    if (!source.active || source.feedUrl === null) continue;

    log(`fetching ${source.id} …`);
    const fetched = await safeFetch(source.feedUrl, source.officialDomains, io);

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
        io,
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
    outcome.itemsRejected = screened.rejected.length;
    // "In window" means the date check passed — the pool relevance chooses from.
    outcome.itemsInWindow = screened.candidates.length;

    for (const candidate of screened.candidates) candidates.push({ source, candidate });
    outcomes.push(outcome);
    log(`  ${source.id}: ${screened.candidates.length} candidates of ${parsedItems.length} seen`);
  }

  return { candidates, outcomes };
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const windowDays = parseWindowDays(process.argv);
  const now = new Date();
  const window = {
    start: new Date(now.getTime() - windowDays * 86_400_000),
    end: now,
  };
  log(`window: ${windowDays} days back from ${now.toISOString()}`);

  const sources = loadSources(await readJson(SOURCES_PATH));
  const existing = await readExistingStories();
  const seenIds = new Set(existing.map((story) => story.id));

  const { candidates, outcomes } = await collect(sources, window, windowDays, seenIds);
  const warnings: string[] = outcomes
    .filter((outcome) => outcome.fetchError !== null || outcome.parseError !== null)
    .map(
      (outcome) =>
        `${outcome.sourceId}: ${outcome.fetchError ?? outcome.parseError} (status ${outcome.status})`,
    );

  // --- relevance: judged by model, keyword rules as the fallback ---
  //
  // The date window has already cut 2,463 feed items to a few hundred, so this
  // is a handful of batched calls. Doing it here rather than inside screening
  // is what lets the per-source cap count stories worth publishing instead of
  // stories that happened to be checked first.
  const agents = (await readJson(AGENTS_PATH)) as { summarizer: SummarizerConfig };
  const { providers, skipped: providersWithoutKeys } = buildProviders(
    agents.summarizer,
    process.env,
  );
  if (providersWithoutKeys.length > 0) {
    log(`no key for: ${providersWithoutKeys.join(', ')} — those providers are unavailable`);
  }

  const sourceNameById = new Map(sources.map((source) => [source.id, source.name]));

  // `always` sources are not sent: their whole feed is on topic by registration,
  // and asking about them would spend calls to be told yes.
  const needsJudgement = candidates.filter(
    (entry) => entry.source.relevanceMode !== 'always',
  );
  const classifyInputs: ClassifyInput[] = needsJudgement.map(({ candidate }) => ({
    id: candidate.item.id,
    title: candidate.raw.title,
    excerpt: candidate.item.summaryOriginal,
    // Free when the feed shipped it; no page is fetched for this.
    body: candidate.item.fullText,
    sourceName: sourceNameById.get(candidate.item.sourceId) ?? candidate.item.sourceId,
  }));

  let classified = new Map<string, { relevant: boolean; topics: readonly string[] }>();
  let undecided = new Set<string>(classifyInputs.map((entry) => entry.id));

  if (classifyInputs.length > 0 && providers.length > 0) {
    log(`judging relevance of ${classifyInputs.length} candidates via ${providers.map((p) => p.id).join(' → ')} …`);
    const result = await classifyAll(classifyInputs, providers, { sleep: delay });
    classified = new Map(
      [...result.decisions].map(([id, decision]) => [
        id,
        { relevant: decision.relevant, topics: decision.topics },
      ]),
    );
    undecided = new Set(result.undecided);
    for (const attempt of result.attempts) {
      log(
        `  [${attempt.provider}] classify batch ${attempt.batch + 1} (${attempt.size}): ${attempt.outcome}` +
          ` (${attempt.durationMs}ms${attempt.status ? `, HTTP ${attempt.status}` : ''})`,
      );
    }
    warnings.push(...result.errors.map((error) => `classifier: ${error}`));
    if (result.undecided.length > 0) {
      warnings.push(
        `${result.undecided.length} candidates fell back to keyword relevance because no provider answered`,
      );
    }
  } else if (classifyInputs.length > 0) {
    warnings.push('relevance judged by keyword rules: no model provider has a key');
  }

  // Apply verdicts and the per-source cap, source by source.
  const items: IngestedItem[] = [];
  const byOutcome = new Map(outcomes.map((outcome) => [outcome.sourceId, outcome]));

  for (const source of sources) {
    const mine = candidates.filter((entry) => entry.source.id === source.id).map((e) => e.candidate);
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
        // Fallback: the deterministic rules, so a model outage degrades
        // judgement rather than stopping the week.
        return isEducationRelevant(candidate.raw)
          ? { relevant: true, topics: resolveTopics(candidate.raw, source.defaultTopics) }
          : { relevant: false, topics: [] };
      },
      effectiveCap(source.maxPerRun, windowDays),
      seenIds,
    );

    items.push(...accepted.accepted);
    const outcome = byOutcome.get(source.id);
    if (outcome) {
      outcome.itemsAccepted = accepted.accepted.length;
      outcome.itemsRejected += accepted.rejected.length;
      outcome.rejectCounts = { ...outcome.rejectCounts, ...(accepted.rejectCounts as Record<string, number>) };
    }
  }
  log(`accepted ${items.length} of ${candidates.length} candidates`);

  // --- article text: only for what the feed did not already carry ---
  //
  // Most publishers put the whole post in content:encoded. Fetching their
  // article page anyway would be asking their servers for something they
  // already handed over. This only runs for the ones that ship a teaser.
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const articleText = new Map<string, string>();
  let articleFetches = 0;
  let articleFailures = 0;

  const needsArticle = items.filter((item) => item.fullText.length === 0);
  if (needsArticle.length > 0) {
    log(`fetching ${needsArticle.length} article pages the feeds did not carry …`);
  }
  const pace = createHostPacer(ARTICLE_FETCH_DELAY_MS, delay);
  for (const item of needsArticle) {
    const source = sourceById.get(item.sourceId);
    if (!source) continue;
    // Several registry sources publish a Crawl-delay. It is a per-host rule, so
    // this waits only when the previous request went to the same site.
    await pace(item.url, () => Date.now());

    const article = await fetchArticleText(item.url, source.officialDomains, io);
    articleFetches += 1;
    if (article.text === null) {
      articleFailures += 1;
      log(`  ${item.sourceId}: ${article.error}`);
      continue;
    }
    articleText.set(item.id, article.text);
  }
  if (articleFetches > 0) {
    log(`  fetched ${articleFetches - articleFailures} of ${articleFetches} article pages`);
    if (articleFailures > 0) {
      warnings.push(
        `${articleFailures} of ${articleFetches} article pages could not be read; those stories were summarized from the feed excerpt`,
      );
    }
  }

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
      summary: item.fullText || articleText.get(item.id) || item.summaryOriginal,
      sourceName: sourceNames.get(item.sourceId) ?? item.sourceId,
    }));

    log(`summarizing ${inputs.length} stories via ${providers.map((p) => p.id).join(' → ')} …`);
    const result = await summarizeAll(inputs, providers);

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
    warnings,
  };

  if (!dryRun) {
    await writeFile(STORIES_PATH, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
    log(`wrote ${merged.length} stories to src/data/stories.json`);
  } else {
    log('dry run: src/data/stories.json not written');
  }

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
