import { readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { makeRun } from './harness';

const item = (n: number) => ({
  title: `Study ${n}`,
  link: `https://example.org/${n}`,
  publishedAt: '2026-08-20T00:00:00Z',
});

const verdicts = { relevant: true, topics: ['cognition'] };

// The five unit tests above prove a boolean returns the right boolean. None of
// them proves run.ts passes the right flags, that a dry run writes no file, or
// that a failed source keeps its baseline — and those are the behaviours that
// decide whether the evidence survives a bad week.
describe('the watermark survives everything that could erase it', () => {
  it('records this run ids after a clean run', async () => {
    const run = await makeRun({ feeds: { s1: [item(1), item(2)] }, verdicts });
    await run.execute();
    expect((await run.readWatermarks()).s1).toHaveLength(2);
  });

  it('writes no watermark file at all on a dry run', async () => {
    const run = await makeRun({ dryRun: true, feeds: { s1: [item(1)] }, verdicts });
    await run.execute();
    expect(await run.readWatermarks()).toEqual({});
  });

  // The whole point: a bad week must not destroy the evidence.
  it('keeps the previous baseline when the fetch fails', async () => {
    const first = await makeRun({ feeds: { s1: [item(1), item(2)] }, verdicts });
    await first.execute();
    const baseline = (await first.readWatermarks()).s1;
    expect(baseline).toHaveLength(2);

    const second = await makeRun({ dir: first.dir, feeds: { s1: [] }, fetchFails: ['s1'] });
    await second.execute();
    expect((await second.readWatermarks()).s1).toEqual(baseline);
  });

  it('keeps the previous baseline when the feed comes back empty', async () => {
    const first = await makeRun({ feeds: { s1: [item(1)] }, verdicts });
    await first.execute();
    const baseline = (await first.readWatermarks()).s1;

    const second = await makeRun({ dir: first.dir, feeds: { s1: [] }, verdicts });
    await second.execute();
    expect((await second.readWatermarks()).s1).toEqual(baseline);
  });

  // One source failing must not reset the others.
  it('advances the healthy source and preserves the failed one', async () => {
    const first = await makeRun({ feeds: { s1: [item(1)], s2: [item(2)] }, verdicts });
    await first.execute();
    const before = await first.readWatermarks();

    const second = await makeRun({
      dir: first.dir,
      fetchFails: ['s1'],
      feeds: { s1: [], s2: [item(2), item(3)] },
      verdicts,
    });
    await second.execute();
    const after = await second.readWatermarks();
    expect(after.s1).toEqual(before.s1);
    expect(after.s2).toHaveLength(2);
  });

  it('leaves no temp files behind', async () => {
    const run = await makeRun({ feeds: { s1: [item(1)] }, verdicts });
    await run.execute();
    expect((await readdir(run.dir)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});

describe('a feed that turned over completely', () => {
  it('warns when nothing overlaps between runs', async () => {
    const first = await makeRun({ feeds: { s1: [item(1), item(2)] }, verdicts });
    await first.execute();

    const second = await makeRun({ dir: first.dir, feeds: { s1: [item(8), item(9)] }, verdicts });
    const report = await second.execute();
    expect(report.warnings.join(' ')).toMatch(/no overlap/);
  });

  // Ordinary churn must stay silent, or the warning is worthless.
  it('says nothing when one item still overlaps', async () => {
    const first = await makeRun({ feeds: { s1: [item(1), item(2)] }, verdicts });
    await first.execute();

    const second = await makeRun({ dir: first.dir, feeds: { s1: [item(2), item(3)] }, verdicts });
    const report = await second.execute();
    expect(report.warnings.join(' ')).not.toMatch(/no overlap/);
  });
});
