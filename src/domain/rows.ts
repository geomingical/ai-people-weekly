import type { StoryRow } from './filters';
import type { Source } from './source';
import type { Story } from './story';

/**
 * Joins stories to their source and drops any story whose source is missing
 * or inactive. Auto-publishing means the source list is the only editorial
 * control there is, so a story must never outlive the source that justified
 * it: deactivating a source removes its stories from the site on the next
 * build, without touching the story records.
 */
export function buildRows(
  stories: readonly Story[],
  sources: readonly Source[],
): StoryRow[] {
  const byId = new Map(sources.map((source) => [source.id, source]));

  return stories.flatMap((story) => {
    const source = byId.get(story.sourceId);
    if (!source || !source.active) return [];
    return [
      {
        story,
        sourceName: source.name,
        sourceCategory: source.category,
        sourceTier: source.tier,
      },
    ];
  });
}

/** Every issue label present in the rows, newest first. */
export function issueLabels(rows: readonly StoryRow[]): string[] {
  const labels = new Set(rows.map((row) => row.story.issue));
  return [...labels].sort((left, right) => right.localeCompare(left, 'en'));
}

export function rowsForIssue(rows: readonly StoryRow[], issue: string): StoryRow[] {
  return rows.filter((row) => row.story.issue === issue);
}
