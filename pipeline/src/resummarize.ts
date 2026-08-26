// Backfill Chinese headlines and summaries onto stories that do not have them.
//
// Why this exists as its own entry point: the weekly run only ever summarizes
// what it just collected. If the model was down that week, or the API key was
// missing, those stories are published with the source's own words and would
// stay that way forever. This fills them in afterwards.
//
// It is the ONE place that rewrites an existing story record, and it is
// deliberately narrow about how: it only ever fills `titleZhTW`, `summaryZhTW`,
// and `summarySource`. The original title, the original summary, the URL, the
// date, and the issue are never touched — those are the reader's check on the
// machine, and a backfill must not be able to alter them.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { lookup } from 'node:dns/promises';
import { createHostPacer, fetchArticleText } from './article';
import type { FetchIO } from './fetcher';
import { summarizeAll, type SummaryInput } from './summarize/summarizer';
import { buildProviders, firstKey, type SummarizerConfig } from './summarize/providers';
import { loadSources } from '../../src/domain/source';
import type { Story } from '../../src/domain/story';

const ROOT = resolve(import.meta.dirname, '../..');

/** Between article-page requests. Several registry sources publish a
 *  Crawl-delay of 10 seconds; this stays on the polite side of all of them. */
const ARTICLE_FETCH_DELAY_MS = 10_000;

function pause(ms: number): Promise<void> {
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
const SOURCES_PATH = resolve(ROOT, 'src/data/sources.json');
const STORIES_PATH = resolve(ROOT, 'src/data/stories.json');
const AGENTS_PATH = resolve(ROOT, 'pipeline/config/agents.json');

function log(message: string): void {
  process.stderr.write(`${message}\n`);
}

/** Reads `--limit <n>`, for trying the model on a handful before committing to all. */
export function parseLimit(argv: readonly string[]): number | null {
  const index = argv.indexOf('--limit');
  if (index === -1) return null;
  const value = Number(argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

/** Stories still carrying the source's own words rather than a machine summary. */
export function needsSummary(stories: readonly Story[]): Story[] {
  return stories.filter((story) => story.summarySource !== 'machine');
}

/**
 * Fills in the Chinese fields and nothing else. Returns a new array; the input
 * stories are not mutated.
 */
export function applySummaries(
  stories: readonly Story[],
  byId: ReadonlyMap<string, { titleZhTW: string; summaryZhTW: string }>,
): Story[] {
  return stories.map((story) => {
    const machine = byId.get(story.id);
    if (!machine) return story;
    return {
      ...story,
      titleZhTW: machine.titleZhTW,
      summaryZhTW: machine.summaryZhTW,
      summarySource: 'machine',
    };
  });
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const limit = parseLimit(process.argv);


  const stories = JSON.parse(await readFile(STORIES_PATH, 'utf8')) as Story[];
  const sources = loadSources(JSON.parse(await readFile(SOURCES_PATH, 'utf8')));
  const sourceNames = new Map(sources.map((source) => [source.id, source.name]));

  const pending = needsSummary(stories);
  const targets = limit === null ? pending : pending.slice(0, limit);
  log(`${pending.length} stories without a machine summary; summarizing ${targets.length}`);
  if (targets.length === 0) return;

  const agents = JSON.parse(await readFile(AGENTS_PATH, 'utf8')) as {
    summarizer: SummarizerConfig;
  };
  const modelOverrideIndex = process.argv.indexOf('--model');
  const modelOverride =
    modelOverrideIndex === -1 ? null : (process.argv[modelOverrideIndex + 1] ?? null);
  const onlyIndex = process.argv.indexOf('--provider');
  const onlyProvider = onlyIndex === -1 ? null : (process.argv[onlyIndex + 1] ?? null);

  const specs = onlyProvider
    ? agents.summarizer.providers.filter((spec) => spec.id === onlyProvider)
    : agents.summarizer.providers;
  const { providers, skipped } = buildProviders({ ...agents.summarizer, providers: specs }, process.env);

  if (skipped.length > 0) log(`no key for: ${skipped.join(', ')}`);
  if (providers.length === 0) {
    log('no model provider has a key — nothing to do');
    process.exitCode = 1;
    return;
  }
  if (modelOverride !== null && providers[0]) providers[0].model = modelOverride;
  log(`providers: ${providers.map((entry) => entry.id).join(' → ')}`);

  // A backfill reads stories.json, which deliberately does not keep the article
  // body — so the article page is fetched here. Failing to read one is not an
  // error: that story is summarized from its stored excerpt instead.
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const articleText = new Map<string, string>();
  let fetched = 0;
  let failed = 0;

  log(`fetching ${targets.length} article pages …`);
  const pace = createHostPacer(ARTICLE_FETCH_DELAY_MS, pause);
  for (const story of targets) {
    const source = sourceById.get(story.sourceId);
    if (!source) continue;
    await pace(story.url, () => Date.now());

    const article = await fetchArticleText(story.url, source.officialDomains, io);
    fetched += 1;
    if (article.text === null) {
      failed += 1;
      log(`  ${story.sourceId}: ${article.error}`);
      continue;
    }
    articleText.set(story.id, article.text);
  }
  log(`  read ${fetched - failed} of ${fetched} article pages`);

  const inputs: SummaryInput[] = targets.map((story) => ({
    id: story.id,
    title: story.title,
    summary: articleText.get(story.id) ?? story.summaryOriginal,
    sourceName: sourceNames.get(story.sourceId) ?? story.sourceId,
  }));

  const started = Date.now();
  const result = await summarizeAll(inputs, providers);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  const byId = new Map(
    result.outputs.map((output) => [
      output.id,
      { titleZhTW: output.titleZhTW, summaryZhTW: output.summaryZhTW },
    ]),
  );
  const updated = applySummaries(stories, byId);

  log(`${elapsed}s — ${result.outputs.length} summarized, ${result.failures} fell back`);
  for (const attempt of result.attempts) {
    log(
      `  [${attempt.provider}] batch ${attempt.batch + 1} attempt ${attempt.attempt + 1}: ${attempt.outcome}` +
        ` (${attempt.durationMs}ms${attempt.status ? `, HTTP ${attempt.status}` : ''}` +
        `${attempt.finishReason ? `, finish=${attempt.finishReason}` : ''}` +
        `${attempt.completionTokens ? `, ${attempt.completionTokens} tokens` : ''}` +
        `${attempt.retriedAfterMs ? `, retrying in ${Math.round(attempt.retriedAfterMs / 1000)}s` : ''})`,
    );
  }
  for (const error of result.errors) log(`  ${error}`);

  if (dryRun) {
    // Show the actual text. Counts alone cannot tell you whether a model is
    // producing something worth publishing.
    for (const output of result.outputs) {
      const story = stories.find((entry) => entry.id === output.id);
      log('');
      log(`  原 ${story?.title.slice(0, 88) ?? ''}`);
      log(`  中 ${output.titleZhTW}`);
      log(`  摘 ${output.summaryZhTW}`);
    }
    log('');
    log('dry run: src/data/stories.json not written');
  } else {
    await writeFile(STORIES_PATH, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
    log(`wrote ${updated.length} stories`);
  }
}

// Only run when this file is executed directly. Without this, importing the
// module — which the test suite does — would fire the CLI as a side effect.
const isEntryPoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  main().catch((error: unknown) => {
    log(`resummarize crashed: ${(error as Error).stack ?? String(error)}`);
    process.exitCode = 1;
  });
}
