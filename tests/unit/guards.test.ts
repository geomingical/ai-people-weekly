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

  it('finds the workflows', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  // This site publishes automatically. An automatic trigger that arrives by
  // accident would start publishing to the public internet without anyone
  // deciding to. Exactly ONE workflow is allowed a schedule, and only because
  // Ming enabled it on 2026-08-19 after a manual CI run proved the whole loop.
  const SCHEDULED_BY_DESIGN = 'weekly-digest.yml';

  it.each(files)('%s has no unintended automatic trigger', (name) => {
    const lines = readFileSync(resolve(dir, name), 'utf8').split('\n');
    const triggers = lines.filter((line) =>
      /^\s*(schedule|push|pull_request|pull_request_target|release):/.test(line),
    );
    const allowed =
      name === SCHEDULED_BY_DESIGN ? triggers.filter((line) => /^\s*schedule:/.test(line)) : [];
    expect(triggers.filter((line) => !allowed.includes(line))).toEqual([]);
  });

  // A push or pull_request trigger would publish on every commit, which is a
  // different thing entirely from a weekly digest.
  it.each(files)('%s never publishes on a push', (name) => {
    const lines = readFileSync(resolve(dir, name), 'utf8').split('\n');
    expect(
      lines.filter((line) => /^\s*(push|pull_request_target|release):/.test(line)),
    ).toEqual([]);
  });

  it('keeps the weekly digest on a weekly cron, not a more frequent one', () => {
    const body = readFileSync(resolve(dir, SCHEDULED_BY_DESIGN), 'utf8');
    const cron = /^\s*-\s*cron:\s*'([^']+)'/m.exec(body)?.[1];
    expect(cron).toBeDefined();
    // Five fields, and the day-of-week field must name a specific day.
    const fields = (cron ?? '').trim().split(/\s+/);
    expect(fields).toHaveLength(5);
    expect(fields[4]).not.toBe('*');
  });
});

describe('source registry', () => {
  const sources = loadSources(
    JSON.parse(readFileSync(resolve(ROOT, 'src/data/sources.json'), 'utf8')),
  );

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
