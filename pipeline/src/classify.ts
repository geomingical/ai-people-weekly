// Topic tagging only.
//
// The education project used keyword rules for relevance and then replaced them
// with a model, because words that mean two things ("assessment" as an exam and
// as model evaluation) break word-matching. This project inherits that verdict
// and goes further: its editorial line is "was a person measured, or a model",
// which no word list can decide. Relevance lives entirely in classify-agent.ts,
// and when the model cannot answer, nothing is published — see ingest.ts.
//
// What is left here is tagging, where a wrong guess is cheap and visible: a
// story shows one tag instead of another, and the fix is editing a list.

import type { RawFeedItem } from './contracts';
import { TOPICS } from '../../src/domain/story';

export type Topic = (typeof TOPICS)[number];

const TOPIC_TERMS: Record<Topic, string[]> = {
  sycophancy: [
    'sycophancy', 'sycophantic', 'flattery', 'flattering', 'obsequious',
    'agreeableness', 'validation', 'people-pleasing',
    '奉承', '迎合', '討好', '諂媚',
  ],
  dependence: [
    'dependence', 'dependency', 'reliance', 'reliant', 'overreliance',
    'habit', 'habitual', 'compulsive', 'withdrawal', 'addiction', 'addictive',
    '依賴', '成癮', '習慣性',
  ],
  relationships: [
    'companion', 'companionship', 'parasocial', 'attachment', 'intimacy',
    'romantic', 'friendship', 'relationship', 'relationships',
    'anthropomorphism', 'anthropomorphic', 'self-disclosure', 'emotional support',
    '陪伴', '擬社會', '依附', '親密', '關係', '自我揭露',
  ],
  trust: [
    'trust', 'distrust', 'overtrust', 'automation bias', 'calibration',
    'appropriate reliance', 'algorithm aversion', 'credibility', 'deference',
    'advice', 'advice-taking', 'persuasion', 'persuasive',
    '信任', '過度信賴', '說服', '可信度',
  ],
  wellbeing: [
    'wellbeing', 'well-being', 'loneliness', 'lonely', 'isolation',
    'mental health', 'depression', 'anxiety', 'distress', 'suicidal',
    'psychological harm', 'emotional harm', 'therapy', 'therapeutic',
    '孤獨', '孤獨感', '心理健康', '憂鬱', '焦慮', '心理傷害',
  ],
  cognition: [
    'cognitive', 'cognition', 'critical thinking', 'offloading', 'deskilling',
    'skill decay', 'skill erosion', 'memory', 'metacognition',
    'homogenization', 'linguistic diversity', 'creativity',
    '認知', '批判思考', '外包', '去技能', '記憶', '同質化',
  ],
  social: [
    'prosocial', 'antisocial', 'honesty', 'dishonesty', 'deception',
    'cooperation', 'conflict', 'social behaviour', 'social behavior',
    'moral', 'norms', 'empathy', 'perspective taking',
    '親社會', '誠實', '欺騙', '合作', '衝突', '道德', '同理',
  ],
};

/** Word-boundary match for Latin terms; substring for CJK, which has no spaces. */
function containsTerm(haystack: string, term: string): boolean {
  if (/^[\x20-\x7e]+$/.test(term)) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(haystack);
  }
  return haystack.includes(term);
}

/**
 * Topics found in the item's own words. Returns an empty array when nothing
 * matches — the caller falls back to the source's defaultTopics rather than
 * this function inventing one, so an untagged story is impossible.
 */
export function inferTopics(item: RawFeedItem): Topic[] {
  // Tags come from the headline and excerpt only. A whole abstract touches many
  // subjects in passing; the tags are meant to say what the paper is about.
  const text = `${item.title} ${item.summary}`.toLocaleLowerCase();
  const found = (Object.keys(TOPIC_TERMS) as Topic[]).filter((topic) =>
    TOPIC_TERMS[topic].some((term) => containsTerm(text, term)),
  );
  // Three tags is the point where a row's tag list stops being scannable.
  return found.slice(0, 3);
}

export function resolveTopics(item: RawFeedItem, defaultTopics: readonly Topic[]): Topic[] {
  const inferred = inferTopics(item);
  return inferred.length > 0 ? inferred : [...defaultTopics];
}
