import { describe, expect, it } from 'vitest';
import { detectFeedGap, shouldCommitWatermark } from '../src/watermark';

describe('detectFeedGap', () => {
  // The ordinary case: one new article arrives and the oldest is evicted.
  // Nothing was lost, and warning here would make the warning worthless.
  it('is silent on ordinary churn', () => {
    expect(detectFeedGap(['a', 'b', 'c', 'd'], ['b', 'c', 'd', 'e'])).toBeNull();
  });

  it('is silent when a single item still overlaps', () => {
    expect(detectFeedGap(['a', 'b', 'c', 'd'], ['d', 'e', 'f', 'g'])).toBeNull();
  });

  // No overlap: items may have appeared and been evicted without ever being
  // fetched, and nothing else in the pipeline can see that.
  it('warns when nothing overlaps', () => {
    const gap = detectFeedGap(['a', 'b', 'c'], ['x', 'y', 'z']);
    expect(gap).not.toBeNull();
    expect(gap).toContain('no overlap');
  });

  it('is silent on the first run, when there is nothing to compare', () => {
    expect(detectFeedGap([], ['a', 'b'])).toBeNull();
  });

  it('is silent when the feed came back empty this run', () => {
    expect(detectFeedGap(['a', 'b'], [])).toBeNull();
  });
});

describe('shouldCommitWatermark', () => {
  const ok = { dryRun: false, fetchOk: true, parseOk: true, currentIds: ['a'] };

  it('commits after a clean run', () => {
    expect(shouldCommitWatermark(ok)).toBe(true);
  });

  it('never commits on a dry run', () => {
    expect(shouldCommitWatermark({ ...ok, dryRun: true })).toBe(false);
  });

  it('keeps the old baseline when the fetch failed', () => {
    expect(shouldCommitWatermark({ ...ok, fetchOk: false })).toBe(false);
  });

  it('keeps the old baseline when the parse failed', () => {
    expect(shouldCommitWatermark({ ...ok, parseOk: false })).toBe(false);
  });

  // The one that matters most: an empty fetch overwriting a good baseline
  // makes the NEXT run look like a first run, and the question "did the feed
  // turn over in between" becomes permanently unanswerable.
  it('keeps the old baseline when the feed came back empty', () => {
    expect(shouldCommitWatermark({ ...ok, currentIds: [] })).toBe(false);
  });
});
