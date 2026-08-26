import { describe, expect, it } from 'vitest';
import { makeRun } from './harness';

const sumCounts = (counts: Record<string, number>) =>
  Object.values(counts).reduce((total, count) => total + count, 0);

// The bug this guards against lives in run.ts's two-stage aggregation, not in
// screenSourceItems or ingestSourceItems. Asserting on their return values
// would go green while the report stayed wrong — which is exactly what
// happened to the first version of this invariant.
describe('every source reconciles in the report', () => {
  it('seen equals accepted plus every rejection', async () => {
    const run = await makeRun({
      sources: { s1: { maxPerRun: 2, dateStrategy: 'dcdate' } },
      feeds: {
        s1: [
          { title: 'Kept 1', link: 'https://example.org/1', dcDate: '2026-08-20' },
          { title: 'Kept 2', link: 'https://example.org/2', dcDate: '2026-08-21' },
          { title: 'Over cap', link: 'https://example.org/3', dcDate: '2026-08-22' },
          { title: 'Too old', link: 'https://example.org/4', dcDate: '2020-01-01' },
          { title: 'Month only', link: 'https://example.org/5', dcDate: '2026-08' },
          { title: 'Same as 1', link: 'https://example.org/1', dcDate: '2026-08-20' },
        ],
      },
      verdicts: { relevant: true, topics: ['cognition'] },
    });
    const report = await run.execute();
    const outcome = report.sources[0]!;

    expect(outcome.itemsSeen).toBe(outcome.itemsAccepted + sumCounts(outcome.rejectCounts));
    expect(outcome.itemsRejected).toBe(sumCounts(outcome.rejectCounts));
    expect(await run.readStories()).toHaveLength(outcome.itemsAccepted);
  });

  // The acceptance stage produces only high-volume reasons, none of which are
  // in the detail list. Counting rejections by that list's length would report
  // them all as zero.
  it('counts the acceptance stage even though it keeps no details', async () => {
    const run = await makeRun({
      sources: { s1: { maxPerRun: 1, dateStrategy: 'dcdate' } },
      feeds: {
        s1: [
          { title: 'Kept', link: 'https://example.org/1', dcDate: '2026-08-20' },
          { title: 'Over cap', link: 'https://example.org/2', dcDate: '2026-08-20' },
          { title: 'Also over cap', link: 'https://example.org/3', dcDate: '2026-08-20' },
        ],
      },
      verdicts: { relevant: true, topics: ['cognition'] },
    });
    const report = await run.execute();
    const outcome = report.sources[0]!;
    expect(outcome.rejectCounts['over-cap']).toBe(2);
    expect(outcome.itemsRejected).toBe(2);
    expect(outcome.rejectDetails).toHaveLength(0);
  });

  // duplicate is produced by BOTH stages. An object spread would overwrite one
  // with the other and the totals would still look plausible.
  it('adds same-named reasons from both stages instead of overwriting', async () => {
    const run = await makeRun({
      sources: { s1: { dateStrategy: 'dcdate' } },
      feeds: {
        s1: [
          { title: 'A', link: 'https://example.org/a', dcDate: '2026-08-20' },
          { title: 'A again', link: 'https://example.org/a', dcDate: '2026-08-20' },
        ],
      },
      verdicts: { relevant: true, topics: ['cognition'] },
    });
    const report = await run.execute();
    const outcome = report.sources[0]!;
    expect(outcome.itemsSeen).toBe(outcome.itemsAccepted + sumCounts(outcome.rejectCounts));
  });

  it('keeps the URL of a rare rejection so it can be checked after the feed moves on', async () => {
    const run = await makeRun({
      sources: { s1: { dateStrategy: 'dcdate' } },
      feeds: {
        s1: [{ title: 'Advisory Board and Contents', link: 'https://example.org/fm', dcDate: '2026-08' }],
      },
    });
    const report = await run.execute();
    expect(report.sources[0]!.rejectDetails).toEqual([
      {
        reason: 'imprecise-date',
        title: 'Advisory Board and Contents',
        url: 'https://example.org/fm',
        rawDate: '2026-08',
      },
    ]);
  });
});
