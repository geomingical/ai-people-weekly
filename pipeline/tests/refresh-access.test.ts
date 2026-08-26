import { describe, expect, it, vi } from 'vitest';
import { parseLimit, refreshAccess, selectForRefresh } from '../src/refresh-access';
import type { Story } from '../../src/domain/story';

const story = (over: Partial<Story> = {}): Story =>
  ({
    id: '0123456789abcdef',
    sourceId: 's',
    title: 'A study of companion chatbots',
    summaryOriginal: 'x',
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
    access: 'unknown',
    openUrl: null,
    ...over,
  }) as Story;

const NOW = new Date('2026-08-26T00:00:00.000Z');

describe('selectForRefresh', () => {
  // Open is settled: a free copy that existed does not stop existing.
  it('leaves open stories alone', () => {
    expect(selectForRefresh([story({ access: 'open' })], NOW)).toHaveLength(0);
  });

  // The first version of this design re-checked only unknown, which would have
  // frozen every restricted answer at whatever was true the day it was taken.
  it('re-checks restricted as well as unknown', () => {
    const picked = selectForRefresh(
      [
        story({ id: 'a'.repeat(16), access: 'unknown' }),
        story({ id: 'b'.repeat(16), access: 'restricted' }),
      ],
      NOW,
    );
    expect(picked.map((s) => s.access).sort()).toEqual(['restricted', 'unknown']);
  });

  it('stops at the window rather than re-querying the whole archive', () => {
    const old = story({ publishedAt: '2026-01-01T00:00:00.000Z' });
    expect(selectForRefresh([old], NOW)).toHaveLength(0);
  });
});

describe('refreshAccess', () => {
  it('promotes a story that has since become free', async () => {
    const before = [story({ access: 'restricted' })];
    const lookupImpl = vi.fn().mockResolvedValue({
      found: true,
      abstract: null,
      access: 'open',
      openUrl: 'https://repo/pdf',
    });
    const { stories, outcome } = await refreshAccess(before, before, lookupImpl);
    expect(stories[0]!.access).toBe('open');
    expect(stories[0]!.openUrl).toBe('https://repo/pdf');
    expect(outcome.changed).toBe(1);
  });

  // Writing 'unknown' over a 'restricted' answer would lose information, and a
  // lookup that found nothing is not evidence of anything.
  it('leaves a story untouched when the lookup found nothing', async () => {
    const before = [story({ access: 'restricted' })];
    const lookupImpl = vi.fn().mockResolvedValue({
      found: false,
      abstract: null,
      access: 'unknown',
      openUrl: null,
    });
    const { stories, outcome } = await refreshAccess(before, before, lookupImpl);
    expect(stories[0]!.access).toBe('restricted');
    expect(outcome.changed).toBe(0);
  });

  it('does not touch stories outside the candidate list', async () => {
    const target = story({ id: 'a'.repeat(16), access: 'unknown' });
    const other = story({ id: 'b'.repeat(16), access: 'restricted' });
    const lookupImpl = vi.fn().mockResolvedValue({
      found: true, abstract: null, access: 'open', openUrl: null,
    });
    const { stories } = await refreshAccess([target, other], [target], lookupImpl);
    expect(stories[0]!.access).toBe('open');
    expect(stories[1]!.access).toBe('restricted');
  });
});

describe('parseLimit', () => {
  it('reads a positive limit and ignores anything else', () => {
    expect(parseLimit(['--limit', '5'])).toBe(5);
    expect(parseLimit(['--limit', '0'])).toBeNull();
    expect(parseLimit([])).toBeNull();
  });
});
