// A real run, with only its outside edges replaced.
//
// The temptation this file exists to resist: writing a fake that returns
// plausible-looking outcomes. That would make every test green and prove
// nothing. Only the socket, the model and the paths are faked here — every
// decision the site actually makes is made by the real code under test.
//
// In particular the network is faked BELOW safeFetch, so the allowlist, the
// redirect chain and the private-address check all run for real.

import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runWeek, type RunOptions } from '../src/run';
import type { ProviderConfig, SummaryInput } from '../src/summarize/summarizer';
import type { ClassifyInput } from '../src/classify-agent';
import type { RunReport } from '../src/contracts';
import type { Story } from '../../src/domain/story';

export interface FakeItem {
  title: string;
  link: string;
  /** Written as <pubDate>. */
  publishedAt?: string;
  /** Written as <dc:date>. Use '2026-08' to exercise month-only precision. */
  dcDate?: string;
  summary?: string;
  /** Give the item a feed body, so source-text selection can be observed. */
  contentEncoded?: string;
}

export interface HarnessOptions {
  dryRun?: boolean;
  windowDays?: number;
  now?: string;
  /** Injectable monotonic clock, so durationMs can be asserted exactly. */
  monotonicNow?: () => number;
  /** Reuse a previous run's directory, so state really carries over. */
  dir?: string;
  /** Per-source overrides merged onto the default source record. */
  sources?: Record<string, Record<string, unknown>>;
  feeds?: Record<string, FakeItem[]>;
  /** One verdict for every candidate, or a per-id map. */
  verdicts?: Verdict | Record<string, Verdict>;
  /** Ids the fake model refuses to answer for. `['*']` is a full outage. */
  undecided?: string[];
  /** What the fake OpenAlex returns. The ladder itself is not faked. */
  openAlex?: Partial<{
    found: boolean;
    abstract: string | null;
    access: 'open' | 'restricted' | 'unknown';
    openUrl: string | null;
  }>;
  /** Sources whose socket fails, to prove a failure preserves state. */
  fetchFails?: string[];
  /** Redirect a source's feed here, to exercise the real redirect guard. */
  redirects?: Record<string, string>;
  summarizeFails?: boolean;
  /** Observation hooks. They record; they never change what the real code does. */
  onFetch?: (url: string) => void;
  onSummarize?: (inputs: readonly SummaryInput[]) => void;
}

interface Verdict {
  relevant: boolean;
  topics: string[];
}

/**
 * The Source contract AS IT EXISTS AT THIS TASK.
 *
 * sourceSchema is .strict(), so one field from a later task makes loadSources
 * throw and no test reaches the run seam at all. Every task that changes the
 * contract updates this fixture and stages this file.
 */
const DEFAULT_SOURCE = {
  name: 'Test Source',
  feedFormat: 'rss',
  category: 'journal-hci',
  language: 'en',
  region: 'GLOBAL',
  tier: 'research',
  relevanceMode: 'keyword',
  defaultTopics: ['cognition'],
  maxPerRun: 10,
  active: true,
  licenseNote: 'test fixture',
  lastVerified: '2026-08-25',
  notes: 'test fixture',
  urlPattern: null,
  // Added by the task that extended the Source contract. sourceSchema is
  // .strict(), so this fixture has to track it exactly.
  dateStrategy: 'rss',
  abstractStrategy: 'feed',
  articlePageAllowed: false,
  accessDefault: null,
};

function feedXml(items: readonly FakeItem[]): string {
  const entries = items
    .map(
      (item) => `<item>
      <title>${item.title}</title>
      <link>${item.link}</link>
      ${item.dcDate ? `<dc:date>${item.dcDate}</dc:date>` : `<pubDate>${item.publishedAt ?? '2026-08-20T00:00:00Z'}</pubDate>`}
      <description>${item.summary ?? 'x'.repeat(600)}</description>
      ${item.contentEncoded ? `<content:encoded>${item.contentEncoded}</content:encoded>` : ''}
    </item>`,
    )
    .join('');
  return `<?xml version="1.0"?><rss version="2.0"
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>${entries}</channel></rss>`;
}

/** A public address, so the real private-range guard lets the hop through. */
const PUBLIC_IP = '93.184.216.34';

export interface Harness {
  dir: string;
  paths: { sourcesPath: string; storiesPath: string; watermarksPath: string };
  execute: () => Promise<RunReport>;
  readStories: () => Promise<Story[]>;
  readWatermarks: () => Promise<Record<string, string[]>>;
}

export async function makeRun(options: HarnessOptions = {}): Promise<Harness> {
  const dir = options.dir ?? (await mkdtemp(join(tmpdir(), 'ai-people-weekly-')));
  const paths = {
    sourcesPath: join(dir, 'sources.json'),
    storiesPath: join(dir, 'stories.json'),
    watermarksPath: join(dir, 'feed-watermarks.json'),
  };

  const feeds = options.feeds ?? {};
  const ids = Object.keys(feeds).length > 0 ? Object.keys(feeds) : ['s1'];

  await writeFile(
    paths.sourcesPath,
    JSON.stringify(
      ids.map((id) => {
        const override = options.sources?.[id] ?? {};
        // sourceSchema refuses a homepage or feedUrl outside officialDomains,
        // so an override of the allowlist has to carry its URLs with it.
        const domains = (override.officialDomains as string[] | undefined) ?? ['example.org'];
        return {
          ...DEFAULT_SOURCE,
          id,
          officialDomains: domains,
          homepage: `https://${domains[0]}/`,
          feedUrl: `https://${domains[0]}/${id}/feed`,
          ...override,
        };
      }),
      null,
      2,
    ),
  );
  if (!options.dir) await writeFile(paths.storiesPath, '[]');

  const feedUrlToId = new Map(
    ids.map((id) => {
      const domains = (options.sources?.[id]?.officialDomains as string[] | undefined) ?? ['example.org'];
      return [`https://${domains[0]}/${id}/feed`, id];
    }),
  );

  const fakeIo = {
    // Below safeFetch: the allowlist, redirect chain and DNS guard are real.
    fetch: (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      options.onFetch?.(url);
      // Match by path segment, not exact URL, so a redirect that stays inside
      // the source's own domain still reaches its feed.
      const segment = new URL(url).pathname.split('/')[1];
      const id = feedUrlToId.get(url) ?? (ids.includes(segment) ? segment : undefined);

      if (id !== undefined && options.fetchFails?.includes(id)) {
        throw new TypeError('fetch failed');
      }
      // Only the original feed URL redirects. Redirecting the destination too
      // would loop until safeFetch's hop limit and look like a blocked host.
      if (feedUrlToId.has(url) && id !== undefined && options.redirects?.[id]) {
        return new Response(null, {
          status: 302,
          headers: { location: options.redirects[id] },
        });
      }
      if (id !== undefined) {
        return new Response(feedXml(feeds[id] ?? []), {
          status: 200,
          headers: { 'content-type': 'application/rss+xml' },
        });
      }
      // An article page: the pipeline asks for these when a feed carried no body.
      return new Response('<html><body><article>Article body.</article></body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }) as typeof globalThis.fetch,
    resolve: async () => [PUBLIC_IP],
    now: () => new Date(options.now ?? '2026-08-25T00:00:00.000Z'),
  };

  const verdictFor = (id: string): Verdict | undefined => {
    const undecided = new Set(options.undecided ?? []);
    if (undecided.has('*') || undecided.has(id)) return undefined;
    if (!options.verdicts) return undefined;
    return 'relevant' in options.verdicts
      ? (options.verdicts as Verdict)
      : (options.verdicts as Record<string, Verdict>)[id];
  };

  const deps: RunOptions['deps'] = {
    io: fakeIo,
    classify: (async (items: readonly ClassifyInput[]) => {
      const decisions = new Map<string, unknown>();
      for (const item of items) {
        const verdict = verdictFor(item.id);
        if (verdict) decisions.set(item.id, { id: item.id, ...verdict });
      }
      return {
        decisions,
        undecided: items.filter((item) => !decisions.has(item.id)).map((item) => item.id),
        attempts: [],
        errors: [],
      };
    }) as unknown as RunOptions['deps']['classify'],
    // Matches summarizeAll: takes the assembled SummaryInput[] and returns the
    // full result. Input selection and accounting stay in runWeek.
    summarize: (async (inputs: readonly SummaryInput[]) => {
      options.onSummarize?.(inputs);
      if (options.summarizeFails) {
        return { outputs: [], failures: inputs.length, errors: ['stubbed failure'], attempts: [] };
      }
      return {
        outputs: inputs.map((input) => ({
          id: input.id,
          titleZhTW: '測試標題',
          summaryZhTW: '測試摘要。',
        })),
        failures: 0,
        errors: [],
        attempts: [],
      };
    }) as unknown as RunOptions['deps']['summarize'],
    // One provider, because the pipeline refuses to call the model at all when
    // this list is empty — and a clean checkout has no API key.
    providers: [
      {
        id: 'fake',
        model: 'fake',
        maxOutputTokens: 512,
        jsonMode: 'json-object',
        transport: async () => ({
          content: null,
          meta: { status: 200, durationMs: 0 },
          error: { kind: 'transport', message: 'the fake summarize replaces this' },
        }),
      } as unknown as ProviderConfig,
    ],
    openAlex: async () => ({
      found: true,
      abstract: null,
      access: 'unknown' as const,
      openUrl: null,
      ...options.openAlex,
    }),
    now: () => new Date(options.now ?? '2026-08-25T00:00:00.000Z'),
    monotonicNow: options.monotonicNow ?? (() => performance.now()),
    sleep: async () => {},
  };

  return {
    dir,
    paths,
    execute: () =>
      runWeek({
        dryRun: options.dryRun ?? false,
        windowDays: options.windowDays ?? 7,
        paths,
        deps,
      }),
    readStories: async () => JSON.parse(await readFile(paths.storiesPath, 'utf8')) as Story[],
    // Missing file means a first run, which is not an error.
    readWatermarks: async () => {
      try {
        return JSON.parse(await readFile(paths.watermarksPath, 'utf8')) as Record<string, string[]>;
      } catch {
        return {};
      }
    },
  };
}
