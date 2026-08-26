import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadSources } from '../../src/domain/source';

const registry = JSON.parse(readFileSync('src/data/sources.json', 'utf8')) as unknown;

describe('source registry', () => {
  it('parses', () => {
    expect(() => loadSources(registry)).not.toThrow();
  });

  // ScienceDirect returns 403 on robots.txt and its responses assert
  // tdm-reservation. Only its feed host is ever read.
  it('never lets an Elsevier source fetch article pages', () => {
    const elsevier = loadSources(registry).filter((source) =>
      source.officialDomains.includes('sciencedirect.com'),
    );
    expect(elsevier.length).toBeGreaterThan(0);
    for (const source of elsevier) {
      expect(source.articlePageAllowed).toBe(false);
      expect(source.abstractStrategy).not.toBe('article-page');
    }
  });

  it('only allows the article-page strategy where the page may actually be fetched', () => {
    for (const source of loadSources(registry)) {
      if (source.abstractStrategy === 'article-page') {
        expect(source.articlePageAllowed).toBe(true);
      }
    }
  });

  // A source marked always-open shows "free to read" without a lookup, so a
  // wrong one lies about every article in that journal.
  it('marks always-open venues so they are not shown as unverified', () => {
    const byId = new Map(loadSources(registry).map((source) => [source.id, source]));
    for (const id of ['arxiv-cs-hc', 'arxiv-cs-cy', 'jmir', 'jmir-mental-health']) {
      expect(byId.get(id)?.accessDefault).toBe('open');
    }
  });

  it('keeps every inactive source reason in notes', () => {
    for (const source of loadSources(registry)) {
      if (!source.active) expect(source.notes.length).toBeGreaterThan(20);
    }
  });

  it('has the journals the site was designed around', () => {
    const ids = new Set(loadSources(registry).map((source) => source.id));
    for (const id of ['chb-artificial-humans', 'nature-human-behaviour', 'tochi', 'pew-internet']) {
      expect(ids).toContain(id);
    }
  });
});
