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
  it('publishes the always-sources and says only the gated ones were lost', async () => {
    const run = await makeRun({
      sources: { always: { relevanceMode: 'always' }, gated: { relevanceMode: 'keyword' } },
      feeds: {
        always: [item('From an always source', 'https://example.org/a')],
        gated: [item('Needs a verdict', 'https://example.org/b')],
      },
      undecided: ['*'], // the model answers for nothing
    });
    const report = await run.execute();
    const stories = await run.readStories();

    // The site did publish. The report must not claim otherwise.
    expect(stories).toHaveLength(1);
    expect(report.storiesAdded).toBe(stories.length);
    const warnings = report.warnings.join(' ');
    expect(warnings).toMatch(/model-gated/);
    expect(warnings).not.toMatch(/nothing was published/i);
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
