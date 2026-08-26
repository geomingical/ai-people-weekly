// Re-checks the open-access status of recent stories.
//
// WHY THIS EXISTS. Open-access status is an observation at a point in time, not
// a verdict. OpenAlex derives it from a chain that lags: a paper indexed today
// may have no OA location recorded yet, and an author depositing a preprint
// next month flips `closed` to `green`. The first version of this design
// re-checked only `unknown`, which would have left every `restricted` answer
// frozen at whatever was true the day it was collected.
//
// So BOTH states are re-checked. Only `open` is treated as settled, because a
// free copy that existed does not stop existing.
//
// Runs as its own tool rather than inside the weekly run: it touches stories
// from previous weeks, and a weekly run should not quietly rewrite the archive
// as a side effect of collecting.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { lookup } from './openalex';
import type { Story } from '../../src/domain/story';

const ROOT = resolve(import.meta.dirname, '../..');
const STORIES_PATH = resolve(ROOT, 'src/data/stories.json');

/**
 * How far back to look.
 *
 * Long enough for a deposit to appear — repositories and publisher embargoes
 * work in weeks — and short enough that the tool does not re-query the whole
 * archive every time it runs.
 */
const WINDOW_WEEKS = 8;

/** Between OpenAlex calls. The API asks for polite use and sets no hard limit. */
const REQUEST_DELAY_MS = 250;

function pause(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

function log(message: string): void {
  process.stderr.write(`${message}\n`);
}

/** Reads `--limit <n>`, for trying a handful before committing to all. */
export function parseLimit(argv: readonly string[]): number | null {
  const index = argv.indexOf('--limit');
  if (index === -1) return null;
  const value = Number(argv[index + 1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

/**
 * Stories worth asking about again.
 *
 * `open` is settled. `restricted` and `unknown` are not: the first may have
 * acquired a free copy, and the second may simply not have been indexed yet.
 */
export function selectForRefresh(
  stories: readonly Story[],
  now: Date,
  windowWeeks = WINDOW_WEEKS,
): Story[] {
  const cutoff = now.getTime() - windowWeeks * 7 * 86_400_000;
  return stories.filter(
    (story) =>
      story.access !== 'open' && Date.parse(story.publishedAt) >= cutoff,
  );
}

export interface RefreshOutcome {
  checked: number;
  changed: number;
  changes: { id: string; title: string; from: string; to: string }[];
}

/**
 * Applies fresh lookups. Returns new story objects rather than mutating, so a
 * dry run and a real run take exactly the same path up to the write.
 */
export async function refreshAccess(
  stories: readonly Story[],
  candidates: readonly Story[],
  lookupImpl: typeof lookup,
): Promise<{ stories: Story[]; outcome: RefreshOutcome }> {
  const updates = new Map<string, { access: Story['access']; openUrl: string | null }>();
  const changes: RefreshOutcome['changes'] = [];

  for (const story of candidates) {
    const result = await lookupImpl({ title: story.title });
    await pause(REQUEST_DELAY_MS);

    // A lookup that found nothing leaves the story exactly as it was. Writing
    // 'unknown' over a 'restricted' answer would lose information.
    if (!result.found) continue;
    if (result.access === story.access) continue;

    updates.set(story.id, { access: result.access, openUrl: result.openUrl });
    changes.push({
      id: story.id,
      title: story.title.slice(0, 80),
      from: story.access,
      to: result.access,
    });
  }

  return {
    stories: stories.map((story) => {
      const update = updates.get(story.id);
      return update ? { ...story, ...update } : story;
    }),
    outcome: { checked: candidates.length, changed: changes.length, changes },
  };
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const limit = parseLimit(process.argv);

  const stories = JSON.parse(await readFile(STORIES_PATH, 'utf8')) as Story[];
  const all = selectForRefresh(stories, new Date());
  const candidates = limit === null ? all : all.slice(0, limit);

  log(
    `${stories.length} stories, ${all.length} worth re-checking` +
      `${limit === null ? '' : ` (limited to ${candidates.length})`}`,
  );

  const { stories: next, outcome } = await refreshAccess(stories, candidates, lookup);

  for (const change of outcome.changes) {
    log(`  ${change.from} → ${change.to}: ${change.title}`);
  }

  if (outcome.changed === 0) {
    log('nothing changed');
  } else if (dryRun) {
    log(`dry run: ${outcome.changed} would change, stories.json not written`);
  } else {
    await writeFile(STORIES_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    log(`wrote ${outcome.changed} changes to src/data/stories.json`);
  }

  process.stdout.write(`${JSON.stringify(outcome, null, 2)}\n`);
}

const isEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  main().catch((error: unknown) => {
    log(`refresh-access crashed: ${(error as Error).stack ?? String(error)}`);
    process.exitCode = 1;
  });
}
