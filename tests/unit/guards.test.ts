import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSources } from '../../src/domain/source';
import { messages } from '../../src/domain/i18n';

const ROOT = resolve(import.meta.dirname, '../..');

// Mechanical enforcement of the rules that are cheap to break by accident and
// expensive to notice. A human reviewer should not be the first line of defence
// for any of these.

describe('workflow triggers', () => {
  const dir = resolve(ROOT, '.github/workflows');
  const files = readdirSync(dir).filter((name) => name.endsWith('.yml'));

  function triggerKeys(body: string): string[] {
    const lines = body.split('\n');
    const onLine = lines.findIndex((line) => line === 'on:');
    if (onLine === -1) return [];

    const keys: string[] = [];
    for (const line of lines.slice(onLine + 1)) {
      if (/^\S/.test(line)) break;
      const key = /^  ([a-zA-Z_][\w-]*):/.exec(line)?.[1];
      if (key !== undefined) keys.push(key);
    }
    return keys;
  }

  it('finds the workflows', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s exposes exactly its approved triggers', (name) => {
    const body = readFileSync(resolve(dir, name), 'utf8');
    const approved = name === 'weekly-digest.yml'
      ? ['schedule', 'workflow_dispatch']
      : ['workflow_dispatch'];
    expect(triggerKeys(body).sort()).toEqual(approved.sort());
  });

  // A push or pull_request trigger would publish on every commit, which is a
  // different thing entirely from a weekly digest.
  it.each(files)('%s never publishes on a push', (name) => {
    const lines = readFileSync(resolve(dir, name), 'utf8').split('\n');
    expect(
      lines.filter((line) => /^\s*(push|pull_request_target|release):/.test(line)),
    ).toEqual([]);
  });

  it('weekly digest runs only on its approved schedule or by manual dispatch', () => {
    const body = readFileSync(resolve(dir, 'weekly-digest.yml'), 'utf8');
    const cronLines = body.split('\n').filter((line) => /^\s*-\s*cron:/.test(line));
    expect(cronLines).toHaveLength(1);
    expect(cronLines[0]).toMatch(/^\s*-\s*cron:\s*'30 2 \* \* 1'\s*(?:#.*)?$/);
  });
});

describe('weekly workflow handoff', () => {
  const body = readFileSync(resolve(ROOT, '.github/workflows/weekly-digest.yml'), 'utf8');

  it('runs manual proof against the requested branch, while schedules use main', () => {
    expect(body).toContain(
      "ref: ${{ github.event_name == 'workflow_dispatch' && github.ref_name || 'main' }}",
    );
  });

  it('copies only generated story data onto the latest main commit', () => {
    expect(body).toContain('cp src/data/stories.json "$RUNNER_TEMP/stories.json"');
    expect(body).toContain('git fetch origin main');
    expect(body).toContain('git checkout --detach origin/main');
    expect(body).toContain('cp "$RUNNER_TEMP/stories.json" src/data/stories.json');
    expect(body).toContain('git add src/data/stories.json');
  });

  it('exposes the collected story count to downstream jobs', () => {
    expect(body).toMatch(
      /collect:\n\s{4}outputs:\n\s{6}added: \$\{\{ steps\.pipeline\.outputs\.added \}\}/,
    );
  });

  it('deploys only after collect adds stories', () => {
    const lines = body.split('\n');
    const deployLine = lines.findIndex((line) => line === '  deploy:');
    const deployJob = lines
      .slice(deployLine + 1)
      .findIndex((line) => /^  \S/.test(line));
    const fields = lines
      .slice(deployLine + 1, deployJob === -1 ? undefined : deployLine + 1 + deployJob)
      .filter((line) => /^    (needs|if):/.test(line))
      .map((line) => line.trim());
    expect(deployLine).toBeGreaterThan(-1);
    expect(fields).toEqual([
      'needs: collect',
      "if: needs.collect.outputs.added != '0' && github.ref_name == 'main'",
    ]);
  });
});

describe('source registry', () => {
  const sources = loadSources(
    JSON.parse(readFileSync(resolve(ROOT, 'src/data/sources.json'), 'utf8')),
  );

  /**
   * rss.arxiv.org carries exactly one day of announcements, so a weekly run
   * sees one day and never learns the other six existed — no rejection, no
   * count, nothing in the report. Measured 2026-08-26: 39 items, all one date.
   *
   * The query API takes max_results and sorts by submission date, covering
   * weeks in a single request. This guard exists because the daily feed is the
   * obvious URL to reach for and the loss it causes is invisible.
   */
  it('never collects arXiv from the daily RSS feed', () => {
    for (const source of sources) {
      if (!source.active || source.feedUrl === null) continue;
      expect(source.feedUrl).not.toContain('rss.arxiv.org');
    }
  });

  it('has at least one active source or the site has nothing to collect', () => {
    expect(sources.filter((source) => source.active).length).toBeGreaterThan(0);
  });

  // The registry is the editorial control. An entry with no reuse note or no
  // verification date is one nobody actually checked.
  it.each(sources.map((source) => [source.id, source] as const))(
    '%s records a reuse note and a verification date',
    (_id, source) => {
      expect(source.licenseNote.length).toBeGreaterThan(0);
      expect(source.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    },
  );

  // An inactive source is a claim that something is wrong with it. That claim
  // needs to be written down, or nobody will know whether it can be re-enabled.
  it.each(sources.filter((source) => !source.active).map((source) => [source.id, source] as const))(
    'inactive source %s explains why in its notes',
    (_id, source) => {
      expect(source.notes.length).toBeGreaterThan(20);
    },
  );

  it('caps every source so no single feed can become the whole issue', () => {
    for (const source of sources) {
      expect(source.maxPerRun).toBeGreaterThan(0);
      expect(source.maxPerRun).toBeLessThanOrEqual(20);
    }
  });
});

// Ming's rule, made mechanical: the full article text never reaches the web.
// The site keeps a short excerpt and the link; the body the model reads lives
// only in memory for one call. Several sources in the registry state "summary
// and link only", so this is a licence commitment, not a preference.
describe('published data carries excerpts, not articles', () => {
  const stories = JSON.parse(
    readFileSync(resolve(ROOT, 'src/data/stories.json'), 'utf8'),
  ) as {
    id: string;
    url: string;
    summaryOriginal: string;
    summaryZhTW: string | null;
    titleZhTW: string | null;
  }[];

  /**
   * A brand-new site has published nothing yet, and `it.each([])` runs zero
   * tests while reporting success — so an empty file would make every
   * per-story guard below pass vacuously without anyone noticing.
   *
   * This constant makes that state deliberate instead of accidental. The first
   * real pipeline run flipped it to true on 2026-08-26, and it must never go
   * back: an empty stories.json from here on is a fault, not a fresh start.
   */
  const SITE_HAS_PUBLISHED = true;

  it('has stories to check, once the site has published anything', () => {
    if (!SITE_HAS_PUBLISHED) {
      expect(stories).toEqual([]);   // declared empty, not accidentally empty
      return;
    }
    expect(stories.length).toBeGreaterThan(0);
  });

  // The parser caps excerpts at 400 characters. A record holding thousands
  // would mean an article body leaked into the published JSON.
  it.each(stories.map((story) => [story.id, story] as const))(
    'story %s stores an excerpt, not a body',
    (_id, story) => {
      expect(story.summaryOriginal.length).toBeLessThanOrEqual(450);
    },
  );

  it.each(stories.map((story) => [story.id, story] as const))(
    'story %s links to the original over https',
    (_id, story) => {
      expect(story.url).toMatch(/^https:\/\//);
    },
  );

  // The machine summary is meant to be a couple of sentences, not a reprint.
  it.each(
    stories.filter((story) => story.summaryZhTW !== null).map((story) => [story.id, story] as const),
  )('story %s keeps its machine summary short', (_id, story) => {
    expect((story.summaryZhTW ?? '').length).toBeLessThanOrEqual(320);
  });

  it('never stores an article-body field', () => {
    const fields = new Set(stories.flatMap((story) => Object.keys(story)));
    for (const banned of ['fullText', 'articleText', 'body', 'content']) {
      expect(fields.has(banned)).toBe(false);
    }
  });
});

describe('message catalog', () => {
  const entries = Object.entries(messages);

  it.each(entries)('%s has a non-empty string in both languages', (_key, value) => {
    expect(value['zh-tw'].length).toBeGreaterThan(0);
    expect(value.en.length).toBeGreaterThan(0);
  });

  // The machine-summary disclosure is the one label the product cannot ship
  // without: it is what lets a reader tell the model's words from the source's.
  it('keeps the machine-summary badge distinct from the source-summary badge', () => {
    expect(messages.storyMachineSummaryBadge['zh-tw']).not.toBe(
      messages.storySourceSummaryBadge['zh-tw'],
    );
    expect(messages.storyMachineSummaryBadge.en).not.toBe(messages.storySourceSummaryBadge.en);
  });
});

describe('styling discipline', () => {
  function astroFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) return astroFiles(full);
      return entry.name.endsWith('.astro') ? [full] : [];
    });
  }

  const files = [
    ...astroFiles(resolve(ROOT, 'src/components')),
    ...astroFiles(resolve(ROOT, 'src/layouts')),
  ];

  // Colours live in one place. A literal in a component is a colour nobody can
  // change from the token file, and it will not follow a future theme change.
  it.each(files)('%s uses colour tokens, not literals', (file) => {
    const styles = readFileSync(file, 'utf8').match(/<style>[\s\S]*?<\/style>/g) ?? [];
    for (const block of styles) {
      expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(block).not.toMatch(/\b(rgb|rgba|hsl|hsla|oklch)\(/);
    }
  });

  // Scoped styles are what make a component a real boundary. `:global(` outside
  // the layout reaches into other components and dissolves that boundary.
  it.each(files.filter((file) => !file.endsWith('BaseLayout.astro')))(
    '%s does not reach outside its own scope',
    (file) => {
      const styles = readFileSync(file, 'utf8').match(/<style>[\s\S]*?<\/style>/g) ?? [];
      for (const block of styles) expect(block).not.toContain(':global(');
    },
  );
});
