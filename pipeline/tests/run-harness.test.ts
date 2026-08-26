import { describe, expect, it } from 'vitest';
import { makeRun } from './harness';

const item = (n: number, over: Record<string, unknown> = {}) => ({
  title: `Study ${n}`,
  link: `https://example.org/${n}`,
  publishedAt: '2026-08-20T00:00:00Z',
  ...over,
});

describe('the harness exercises the real pipeline, not a copy of it', () => {
  // If this passed with a stubbed screening stage, the harness would be worthless.
  it('drops an out-of-window item through the real screening code', async () => {
    const run = await makeRun({
      feeds: { s1: [item(1, { publishedAt: '2020-01-01T00:00:00Z' })] },
    });
    const report = await run.execute();
    expect(await run.readStories()).toHaveLength(0);
    expect(report.sources[0].rejectCounts['outside-window']).toBe(1);
  });

  it('writes what the report claims it wrote', async () => {
    const run = await makeRun({
      feeds: { s1: [item(1)] },
      verdicts: { relevant: true, topics: ['cognition'] },
    });
    const report = await run.execute();
    const stories = await run.readStories();
    expect(stories).toHaveLength(report.storiesAdded);
    expect(stories[0].url).toBe('https://example.org/1');
  });

  it('writes nothing at all on a dry run', async () => {
    const run = await makeRun({
      dryRun: true,
      feeds: { s1: [item(1)] },
      verdicts: { relevant: true, topics: ['cognition'] },
    });
    const report = await run.execute();
    expect(report.storiesAdded).toBeGreaterThan(0); // it decided to publish
    expect(await run.readStories()).toHaveLength(0); // and wrote nothing
  });

  // Proves the fake model is a fake MODEL, not a fake gate: the real acceptance
  // code still has to apply the verdict and the per-source cap.
  it('applies the real per-source cap to the fake model verdicts', async () => {
    const run = await makeRun({
      sources: { s1: { maxPerRun: 2 } },
      feeds: { s1: [item(1), item(2), item(3), item(4)] },
      verdicts: { relevant: true, topics: ['cognition'] },
    });
    const report = await run.execute();
    expect(await run.readStories()).toHaveLength(2);
    expect(report.sources[0].rejectCounts['over-cap']).toBe(2);
  });

  // Without providers in the seam this would pass vacuously: the pipeline skips
  // the model entirely when the list is empty, and a clean checkout has no key.
  it('calls the fake model even though no API key exists', async () => {
    let called = false;
    const run = await makeRun({
      feeds: { s1: [item(1)] },
      verdicts: { relevant: true, topics: ['cognition'] },
      onSummarize: () => {
        called = true;
      },
    });
    const report = await run.execute();
    expect(called).toBe(true);
    expect(report.summaries.skippedReason).toBeNull();
  });
});

describe('the seam does not weaken the SSRF boundary', () => {
  // The network is faked below safeFetch, so this exercises the real allowlist
  // and the real redirect chain — not a parameter that merely looks right.
  it('blocks a redirect that leaves the source domain', async () => {
    const run = await makeRun({
      feeds: { s1: [item(1)] },
      redirects: { s1: 'https://evil.example.net/feed' },
      verdicts: { relevant: true, topics: ['cognition'] },
    });
    const report = await run.execute();
    expect(report.sources[0].fetchError).toBe('blocked');
    expect(await run.readStories()).toHaveLength(0);
  });

  it('follows a redirect that stays inside the source domain', async () => {
    const run = await makeRun({
      feeds: { s1: [item(1)] },
      redirects: { s1: 'https://example.org/s1/feed-moved' },
      verdicts: { relevant: true, topics: ['cognition'] },
    });
    const report = await run.execute();
    expect(report.sources[0].fetchError).toBeNull();
    expect(await run.readStories()).toHaveLength(1);
  });

  it('rejects an item whose link left the source domain', async () => {
    const run = await makeRun({
      feeds: { s1: [item(1, { link: 'https://evil.example.net/a' })] },
      verdicts: { relevant: true, topics: ['cognition'] },
    });
    const report = await run.execute();
    expect(await run.readStories()).toHaveLength(0);
    expect(report.sources[0].rejectCounts['off-domain']).toBe(1);
  });
});

describe('summarization stays orchestrated by runWeek', () => {
  // The seam replaces the model call, not the pipeline around it. This fails if
  // SummaryInput assembly is ever moved into the dependency.
  it('prefers the feed body over the excerpt when building the model input', async () => {
    const captured: { summary: string }[] = [];
    const run = await makeRun({
      feeds: {
        s1: [item(1, { summary: 'short teaser', contentEncoded: 'THE FULL BODY '.repeat(60) })],
      },
      verdicts: { relevant: true, topics: ['cognition'] },
      onSummarize: (inputs) => captured.push(...inputs),
    });
    await run.execute();
    expect(captured[0].summary).toContain('THE FULL BODY');
  });

  it('carries the summarizer failure count into the report', async () => {
    const run = await makeRun({
      feeds: { s1: [item(1)] },
      verdicts: { relevant: true, topics: ['cognition'] },
      summarizeFails: true,
    });
    const report = await run.execute();
    expect(report.summaries.failed).toBe(1);
    expect(report.summaries.succeeded).toBe(0);
  });
});

describe('the report carries what Task 14 will need', () => {
  // `>= 0` would pass with a hardcoded zero, a single timestamp, or no
  // measurement at all — on the field used to judge run cost.
  it('measures the run with the monotonic clock it was given', async () => {
    let tick = 1000;
    const run = await makeRun({
      feeds: { s1: [] },
      monotonicNow: () => {
        tick += 250;
        return tick;
      },
    });
    const report = await run.execute();
    expect(report.durationMs).toBe(250);
  });

  it('carries a decision list on a dry run', async () => {
    const run = await makeRun({
      dryRun: true,
      feeds: { s1: [item(1)] },
      verdicts: { relevant: true, topics: ['cognition'] },
    });
    const report = await run.execute();
    expect(report.decisions).toHaveLength(1);
    expect(report.decisions?.[0].verdict).toBe('accepted');
  });

  it('carries no decision list on a normal run', async () => {
    const run = await makeRun({
      feeds: { s1: [item(1)] },
      verdicts: { relevant: true, topics: ['cognition'] },
    });
    const report = await run.execute();
    expect(report.decisions).toBeUndefined();
  });
});
