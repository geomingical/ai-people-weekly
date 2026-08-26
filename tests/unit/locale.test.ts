import { describe, expect, it } from 'vitest';
import { counterpartPath, localePrefix, localizedPath } from '../../src/domain/locale';
import { defaultFilterState } from '../../src/domain/filters';
import { formatCategory, formatTier, formatTopic } from '../../src/domain/format';

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
    expect(localizedPath('en', '/', { ...defaultFilterState, topic: 'policy' })).toBe(
      '/en/?topic=policy&category=all&region=all',
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
    expect(formatTopic('zh-tw', 'integrity')).toBe('學術誠信');
    expect(formatTopic('en', 'integrity')).toBe('Academic integrity');
    expect(formatCategory('zh-tw', 'vendor-education')).toBe('業者教育方案');
    expect(formatCategory('en', 'taiwan-local')).toBe('Taiwan');
    expect(formatTier('zh-tw', 'first-party')).toBe('第一手');
    expect(formatTier('en', 'community')).toBe('Community');
  });
});
