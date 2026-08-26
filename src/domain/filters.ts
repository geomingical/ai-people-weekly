import type { Source } from './source';
import type { Story, Topic } from './story';
import { TOPICS } from './story';
import { SOURCE_CATEGORIES } from './source';

export type TopicFilter = 'all' | Topic;
export type CategoryFilter = 'all' | Source['category'];
export type RegionFilter = 'all' | string;

export interface FilterState {
  topic: TopicFilter;
  category: CategoryFilter;
  region: RegionFilter;
  query: string;
}

export const defaultFilterState: FilterState = {
  topic: 'all',
  category: 'all',
  region: 'all',
  query: '',
};

// The pipeline denormalizes each story's source category and tier onto the
// row it ships to the browser, so filtering never needs a second lookup and
// the client-side controller can work from one flat array.
export interface StoryRow {
  story: Story;
  sourceName: string;
  sourceCategory: Source['category'];
  sourceTier: Source['tier'];
}

// First-party statements (a ministry announcing its own policy, a vendor
// announcing its own programme) rank above coverage of them, so a week's page
// leads with what actually happened rather than who wrote about it fastest.
const TIER_RANK: Record<Source['tier'], number> = {
  'first-party': 0,
  institution: 1,
  research: 2,
  media: 3,
  community: 4,
};

function matchesQuery(row: StoryRow, query: string): boolean {
  if (!query) return true;
  return [
    row.story.title,
    row.story.titleZhTW ?? '',
    row.story.summaryOriginal,
    row.story.summaryZhTW ?? '',
    row.sourceName,
  ]
    .join(' ')
    .toLocaleLowerCase()
    .includes(query);
}

export function applyFilters(
  rows: readonly StoryRow[],
  state: FilterState,
): StoryRow[] {
  const query = state.query.trim().toLocaleLowerCase();

  return rows
    .filter((row) => state.topic === 'all' || row.story.topics.includes(state.topic))
    .filter((row) => state.category === 'all' || row.sourceCategory === state.category)
    .filter((row) =>
      // "Global" is not a bucket you filter into — a globally relevant story is
      // relevant everywhere. Selecting a region therefore returns that region's
      // stories plus the global ones.
      state.region === 'all'
        ? true
        : row.story.region === state.region || row.story.region === 'GLOBAL',
    )
    .filter((row) => matchesQuery(row, query))
    .sort((left, right) => {
      const byDate =
        Date.parse(right.story.publishedAt) - Date.parse(left.story.publishedAt);
      if (byDate !== 0) return byDate;

      const byTier = TIER_RANK[left.sourceTier] - TIER_RANK[right.sourceTier];
      if (byTier !== 0) return byTier;

      return left.story.title.localeCompare(right.story.title, 'en');
    });
}

export function serializeFilterState(state: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  params.set('topic', state.topic);
  params.set('category', state.category);
  params.set('region', state.region);
  if (state.query.trim()) params.set('q', state.query.trim());
  return params;
}

const TOPIC_VALUES: ReadonlySet<string> = new Set(TOPICS);
const CATEGORY_VALUES: ReadonlySet<string> = new Set(SOURCE_CATEGORIES);
// Region codes accepted in a URL. Anything else falls back to 'all' rather
// than throwing — a shared link with a stale region must still render.
const REGION_VALUES: ReadonlySet<string> = new Set([
  'GLOBAL', 'TW', 'US', 'EU', 'UK', 'EE', 'CN', 'JP', 'APAC',
]);

export function parseFilterState(input: URLSearchParams | string): FilterState {
  const params = typeof input === 'string' ? new URLSearchParams(input) : input;

  const topicValue = params.get('topic') ?? '';
  const categoryValue = params.get('category') ?? '';
  const regionValue = params.get('region') ?? '';

  return {
    topic: TOPIC_VALUES.has(topicValue) ? (topicValue as Topic) : 'all',
    category: CATEGORY_VALUES.has(categoryValue)
      ? (categoryValue as Source['category'])
      : 'all',
    region: REGION_VALUES.has(regionValue) ? regionValue : 'all',
    query: params.get('q') ?? '',
  };
}

// A country sits in the list on its own rather than folded into its bloc:
// selecting EU would not surface an Estonian story, because the region filter
// matches the story's own region plus GLOBAL. Precision now, a region hierarchy
// only if the list grows enough to need one.
export const REGION_FILTER_OPTIONS = [
  'all', 'GLOBAL', 'TW', 'US', 'EU', 'UK', 'EE',
] as const;
