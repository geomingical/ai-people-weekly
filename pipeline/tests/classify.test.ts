import { describe, expect, it } from 'vitest';
import { inferTopics, resolveTopics } from '../src/classify';
import type { RawFeedItem } from '../src/contracts';

function item(title: string, summary = ''): RawFeedItem {
  return {
    title, summary, fullText: '', link: 'https://example.org/x',
    publishedAt: null, publishedAtRaw: '', doi: null, guid: null,
  };
}

describe('inferTopics', () => {
  it('tags flattery as sycophancy', () => {
    expect(inferTopics(item('Affective Context Amplifies Sycophancy in LLM Responses')))
      .toContain('sycophancy');
  });

  it('tags companionship as relationships', () => {
    expect(inferTopics(item('Romantic Human-Chatbot Relationships'))).toContain('relationships');
  });

  it('tags overreliance as trust', () => {
    expect(inferTopics(item('Overreliance on AI advice in clinical decisions')))
      .toContain('trust');
  });

  it('tags cognitive offloading as cognition', () => {
    expect(inferTopics(item('Cognitive offloading and critical thinking'))).toContain('cognition');
  });

  it('reads Traditional Chinese', () => {
    expect(inferTopics(item('研究：聊天機器人加深使用者的孤獨感'))).toContain('wellbeing');
  });

  it('returns at most three tags', () => {
    const tags = inferTopics(
      item('Sycophancy, dependence, loneliness, trust, and cognition in AI companions'),
    );
    expect(tags.length).toBeLessThanOrEqual(3);
  });

  it('returns no tags when nothing matches', () => {
    expect(inferTopics(item('A new transformer architecture'))).toEqual([]);
  });

  // "machine learning" is not a mention of learning, and "AI" must not match
  // inside a word.
  it('matches at word boundaries, not inside words', () => {
    expect(inferTopics(item('The chair said the repairs were costly'))).toEqual([]);
  });
});

describe('resolveTopics', () => {
  it('falls back to the source defaults when nothing is inferred', () => {
    expect(resolveTopics(item('A new transformer architecture'), ['cognition']))
      .toEqual(['cognition']);
  });

  it('never returns an empty array', () => {
    expect(resolveTopics(item('nothing here'), ['trust']).length).toBeGreaterThan(0);
  });
});
