import type { Story } from '../../src/domain/story';

/**
 * A valid story, as the schema defines it AT THIS TASK.
 *
 * `topics` uses the vocabulary the skeleton still carries; Task 3 replaces it
 * along with TOPICS itself. Kept minimal on purpose — every field here is one
 * a test could come to depend on by accident.
 */
export function makeStory(overrides: Partial<Story> = {}): Story {
  return {
    id: '0123456789abcdef',
    sourceId: 'example-source',
    title: 'Schools trial an AI tutor',
    summaryOriginal: 'A district-wide pilot of an AI tutoring assistant.',
    titleZhTW: null,
    summaryZhTW: null,
    summarySource: 'source-verbatim',
    url: 'https://example.org/a',
    publishedAt: '2026-08-20T00:00:00.000Z',
    fetchedAt: '2026-08-21T00:00:00.000Z',
    issue: '2026-W34',
    topics: ['cognition'],
    region: 'GLOBAL',
    language: 'en',
    ...overrides,
  };
}
