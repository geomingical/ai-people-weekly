import { describe, expect, it } from 'vitest';
import { makeRun } from './harness';

const item = (title: string, link: string) => ({
  title,
  link,
  publishedAt: '2026-08-20T00:00:00Z',
});

// The unit tests above call ingestSourceItems directly, which cannot reach the
// classifyAll -> run -> report path where the warnings are written. This is the
// only place the contradiction below is visible.
describe('a model outage reports itself honestly', () => {
  it('fails closed without publishing a partial issue', async () => {
    let summarized = false;
    const run = await makeRun({
      sources: { always: { relevanceMode: 'always' }, gated: { relevanceMode: 'keyword' } },
      feeds: {
        always: [item('From an always source', 'https://example.org/a')],
        gated: [item('Needs a verdict', 'https://example.org/b')],
      },
      undecided: ['*'], // the model answers for nothing
      onSummarize: () => {
        summarized = true;
      },
    });
    const report = await run.execute();
    const stories = await run.readStories();

    expect(report.outcome).toBe('failed');
    expect(stories).toHaveLength(0);
    expect(report.storiesAdded).toBe(0);
    expect(summarized).toBe(false);
    expect(report.sources.find((source) => source.sourceId === 'always')?.rejectCounts)
      .toMatchObject({ 'run-blocked': 1 });
    const warnings = report.warnings.join(' ');
    expect(warnings).toMatch(/model-gated/);
    expect(warnings).toMatch(/entire run was withheld/i);
  });

  it('shows the gated loss as undecided, not as irrelevant', async () => {
    const run = await makeRun({
      sources: { gated: { relevanceMode: 'keyword' } },
      feeds: { gated: [item('Needs a verdict', 'https://example.org/b')] },
      undecided: ['*'],
    });
    const report = await run.execute();
    const outcome = report.sources[0];
    expect(outcome.rejectCounts.undecided).toBe(1);
    expect(outcome.rejectCounts['not-relevant']).toBeUndefined();
  });

  it('never says keyword in any warning it produces', async () => {
    const run = await makeRun({
      sources: { gated: { relevanceMode: 'keyword' } },
      feeds: { gated: [item('Needs a verdict', 'https://example.org/b')] },
      undecided: ['*'],
    });
    const report = await run.execute();
    expect(await run.readStories()).toHaveLength(0);
    for (const warning of report.warnings) expect(warning).not.toMatch(/keyword/i);
  });
});
