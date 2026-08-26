import { describe, expect, it } from 'vitest';
import {
  countText,
  formatPublishedDate,
  formatRegion,
  primaryHeadline,
  showsTranslatedHeadline,
  summaryView,
} from '../../src/domain/format';
import { REGION_FILTER_OPTIONS } from '../../src/domain/filters';
import { makeStory } from '../fixtures/stories';

describe('primaryHeadline', () => {
  it('shows the machine headline to Chinese readers when one exists', () => {
    const story = makeStory({ titleZhTW: '學校導入 AI 家教' });
    expect(primaryHeadline('zh-tw', story)).toBe('學校導入 AI 家教');
    expect(showsTranslatedHeadline('zh-tw', story)).toBe(true);
  });

  it('falls back to the original headline when nothing was translated', () => {
    const story = makeStory({ titleZhTW: null });
    expect(primaryHeadline('zh-tw', story)).toBe(story.title);
    expect(showsTranslatedHeadline('zh-tw', story)).toBe(false);
  });

  // Round-tripping English through a Chinese-summarising model would add error
  // for no gain, so English readers always get the source's own words.
  it('never shows a translated headline to English readers', () => {
    const story = makeStory({ titleZhTW: '學校導入 AI 家教' });
    expect(primaryHeadline('en', story)).toBe(story.title);
    expect(showsTranslatedHeadline('en', story)).toBe(false);
  });
});

describe('summaryView', () => {
  it('labels a machine summary as machine-written', () => {
    const view = summaryView(
      'zh-tw',
      makeStory({ summarySource: 'machine', summaryZhTW: '重點摘要' }),
    );
    expect(view).toEqual({ text: '重點摘要', badgeKey: 'storyMachineSummaryBadge', isMachine: true });
  });

  it('falls back to the source verbatim text and labels it as the source’s', () => {
    const view = summaryView('zh-tw', makeStory({ summarySource: 'source-verbatim' }));
    expect(view?.isMachine).toBe(false);
    expect(view?.badgeKey).toBe('storySourceSummaryBadge');
  });

  it('returns null when there is nothing to show, rather than an empty label', () => {
    expect(summaryView('zh-tw', makeStory({ summarySource: 'none', summaryOriginal: '' }))).toBeNull();
  });

  it('gives English readers the source summary even when a machine one exists', () => {
    const view = summaryView(
      'en',
      makeStory({ summarySource: 'machine', summaryZhTW: '重點摘要' }),
    );
    expect(view?.isMachine).toBe(false);
    expect(view?.text).toBe(makeStory().summaryOriginal);
  });
});

describe('formatting helpers', () => {
  it('localizes a known region code', () => {
    expect(formatRegion('zh-tw', 'TW')).toBe('台灣');
    expect(formatRegion('en', 'TW')).toBe('Taiwan');
  });

  // Honest raw data beats an invented translation.
  it('renders an unknown region code verbatim', () => {
    expect(formatRegion('zh-tw', 'ZZ')).toBe('ZZ');
  });

  it('shows the publication day only', () => {
    expect(formatPublishedDate('2026-08-18T09:00:00.000Z')).toBe('2026-08-18');
  });

  it('substitutes a count into a template', () => {
    expect(countText('zh-tw', 'resultsCountTemplate', 3)).toBe('符合條件：3 則');
    expect(countText('en', 'resultsCountTemplate', 3)).toBe('3 matching stories');
  });
});

describe('region coverage', () => {
  // Every region a source can produce must have a label, or the UI falls back
  // to a raw code like "EE" that means nothing to a reader.
  it('labels every region the shipped registry uses', async () => {
    const raw = await import('../../src/data/sources.json', { with: { type: 'json' } });
    const regions = new Set(
      (raw.default as { active: boolean; region: string }[])
        .filter((source) => source.active)
        .map((source) => source.region),
    );
    for (const region of regions) {
      expect(formatRegion('zh-tw', region)).not.toBe(region);
      expect(formatRegion('en', region)).not.toBe(region);
    }
  });

  it('offers every produced region as a filter option', async () => {
    const raw = await import('../../src/data/sources.json', { with: { type: 'json' } });
    const regions = new Set(
      (raw.default as { active: boolean; region: string }[])
        .filter((source) => source.active)
        .map((source) => source.region),
    );
    for (const region of regions) {
      expect(REGION_FILTER_OPTIONS as readonly string[]).toContain(region);
    }
  });
});
