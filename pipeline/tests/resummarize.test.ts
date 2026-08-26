import { describe, expect, it } from 'vitest';
import { applySummaries, needsSummary, parseLimit } from '../src/resummarize';
import type { Story } from '../../src/domain/story';

function story(overrides: Partial<Story> = {}): Story {
  return {
    id: 'a'.repeat(16),
    sourceId: 'test',
    title: 'AI arrives in schools',
    summaryOriginal: 'The district is piloting an AI tutor.',
    titleZhTW: null,
    summaryZhTW: null,
    summarySource: 'source-verbatim',
    url: 'https://example.org/a',
    publishedAt: '2026-08-18T09:00:00.000Z',
    fetchedAt: '2026-08-18T12:00:00.000Z',
    issue: '2026-W34',
    topics: ['k12'],
    region: 'US',
    language: 'en',
    ...overrides,
  };
}

describe('needsSummary', () => {
  it('selects stories that never got a machine summary', () => {
    const stories = [
      story({ id: 'a'.repeat(16), summarySource: 'source-verbatim' }),
      story({ id: 'b'.repeat(16), summarySource: 'none', summaryOriginal: '' }),
      story({ id: 'c'.repeat(16), summarySource: 'machine', summaryZhTW: '有了' }),
    ];
    expect(needsSummary(stories).map((entry) => entry.id)).toEqual([
      'a'.repeat(16),
      'b'.repeat(16),
    ]);
  });
});

describe('applySummaries', () => {
  const machine = new Map([['a'.repeat(16), { titleZhTW: '中文標題', summaryZhTW: '中文摘要' }]]);

  it('fills in the Chinese fields and flips the summary source', () => {
    const result = applySummaries([story()], machine);
    expect(result[0]).toMatchObject({
      titleZhTW: '中文標題',
      summaryZhTW: '中文摘要',
      summarySource: 'machine',
    });
  });

  // The original title, summary, URL, date, and issue are the reader's check on
  // the machine. A backfill must never be able to alter them.
  it('leaves every original field untouched', () => {
    const before = story();
    const after = applySummaries([before], machine)[0]!;
    expect(after.title).toBe(before.title);
    expect(after.summaryOriginal).toBe(before.summaryOriginal);
    expect(after.url).toBe(before.url);
    expect(after.publishedAt).toBe(before.publishedAt);
    expect(after.issue).toBe(before.issue);
    expect(after.topics).toEqual(before.topics);
  });

  it('does not mutate the input array', () => {
    const before = story();
    applySummaries([before], machine);
    expect(before.titleZhTW).toBeNull();
    expect(before.summarySource).toBe('source-verbatim');
  });

  it('leaves a story with no new summary exactly as it was', () => {
    const untouched = story({ id: 'z'.repeat(16) });
    expect(applySummaries([untouched], machine)[0]).toEqual(untouched);
  });
});

describe('parseLimit', () => {
  it('reads a positive limit', () => {
    expect(parseLimit(['--limit', '6'])).toBe(6);
  });

  it.each([
    ['no flag', ['--dry-run']],
    ['a missing value', ['--limit']],
    ['a non-number', ['--limit', 'lots']],
    ['zero', ['--limit', '0']],
    ['a negative number', ['--limit', '-3']],
  ])('returns null for %s', (_label, argv) => {
    expect(parseLimit(argv)).toBeNull();
  });
});
