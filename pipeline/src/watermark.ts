// Detecting a feed that turned over completely between runs.
//
// Nature and JMIR feeds hold eight to ten items, all of them recent. If one
// publishes more in a week than its feed can hold, the overflow is never
// fetched at all: no rejection, no count, no trace. Every other loss in this
// pipeline leaves a row in the reject detail; this one leaves nothing, so this
// is the only place it can be made visible.
//
// The test is OVERLAP, not the oldest item. The oldest item is the first thing
// evicted when even one new article arrives, so watching it would fire every
// ordinary week — and a warning that always fires hides the one that matters.

export function detectFeedGap(
  previousIds: readonly string[],
  currentIds: readonly string[],
): string | null {
  // Nothing to compare on a first run, and an empty fetch is a fetch failure
  // that the source outcome already reports.
  if (previousIds.length === 0 || currentIds.length === 0) return null;

  const current = new Set(currentIds);
  if (previousIds.some((id) => current.has(id))) return null;

  return (
    `no overlap with the previous run's ${previousIds.length} items: the feed ` +
    'turned over completely, so anything published in the gap was never fetched'
  );
}

export interface WatermarkCommitCheck {
  dryRun: boolean;
  fetchOk: boolean;
  parseOk: boolean;
  currentIds: readonly string[];
}

/**
 * When the baseline may be replaced.
 *
 * Every condition here exists because failing it would destroy the only
 * evidence this module produces. An empty or failed fetch overwriting a good
 * baseline makes the NEXT run look like a first run, and whether the feed
 * turned over in between becomes permanently unanswerable. A dry run that
 * writes state is not a dry run.
 */
export function shouldCommitWatermark(check: WatermarkCommitCheck): boolean {
  if (check.dryRun) return false;
  if (!check.fetchOk || !check.parseOk) return false;
  return check.currentIds.length > 0;
}
