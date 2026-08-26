import { describe, expect, it } from 'vitest';
import { counterpartPath, localePrefix, localizedPath } from '../../src/domain/locale';
import { defaultFilterState } from '../../src/domain/filters';
import {
  formatAccess,
  formatCategory,
  formatTier,
  formatTopic,
  freeLinkHost,
} from '../../src/domain/format';

describe('localePrefix', () => {
  it('gives English a prefix and leaves the default locale bare', () => {
    expect(localePrefix('en')).toBe('/en');
    expect(localePrefix('zh-tw')).toBe('');
  });
});

describe('localizedPath', () => {
  it('prefixes an English path', () => {
    expect(localizedPath('en', '/archive/')).toBe('/en/archive/');
    expect(localizedPath('zh-tw', '/archive/')).toBe('/archive/');
  });

  it('normalizes a path given without a leading slash', () => {
    expect(localizedPath('en', 'sources/')).toBe('/en/sources/');
  });

  it('appends filter state when given', () => {
    expect(localizedPath('en', '/', { ...defaultFilterState, topic: 'trust' })).toBe(
      '/en/?topic=trust&category=all&region=all',
    );
  });
});

describe('counterpartPath', () => {
  it.each([
    ['/', '/en/'],
    ['/archive/', '/en/archive/'],
    ['/weekly/2026-W34/', '/en/weekly/2026-W34/'],
  ])('maps %s to %s and back', (zh, en) => {
    expect(counterpartPath(zh)).toBe(en);
    expect(counterpartPath(en)).toBe(zh);
  });

  it('maps the bare /en to the site root', () => {
    expect(counterpartPath('/en')).toBe('/');
  });
});

describe('label formatting', () => {
  it('renders every topic, category, and tier in both languages', () => {
    expect(formatTopic('zh-tw', 'wellbeing')).toBe('心理健康');
    expect(formatTopic('en', 'wellbeing')).toBe('Wellbeing');
    expect(formatCategory('zh-tw', 'journal-hci')).toBe('人機互動期刊');
    expect(formatCategory('en', 'preprint')).toBe('Preprints');
    expect(formatTier('zh-tw', 'first-party')).toBe('第一手');
    expect(formatTier('en', 'community')).toBe('Community');
  });
});


describe('access labels', () => {
  it('renders all three states in both languages', () => {
    expect(formatAccess('zh-tw', 'open')).toBe('免費全文');
    expect(formatAccess('zh-tw', 'restricted')).toBe('需訂閱');
    expect(formatAccess('zh-tw', 'unknown')).toBe('未確認');
    expect(formatAccess('en', 'unknown')).toBe('Not checked');
  });

  // Collapsing unknown into restricted would be a lie about the newest work.
  it('never gives unknown the same label as restricted', () => {
    for (const locale of ['zh-tw', 'en'] as const) {
      expect(formatAccess(locale, 'unknown')).not.toBe(formatAccess(locale, 'restricted'));
    }
  });
});

describe('freeLinkHost', () => {
  it('names the host so a reader knows where the link goes', () => {
    expect(freeLinkHost('https://europepmc.org/article/MED/123')).toBe('europepmc.org');
  });

  it('returns null rather than throwing on a bad url', () => {
    expect(freeLinkHost('not a url')).toBeNull();
    expect(freeLinkHost(null)).toBeNull();
  });
});
