import { t, type MessageKey } from './i18n';
import type { Source } from './source';
import type { Locale, Story, Topic } from './story';

const topicKeys: Record<Topic, MessageKey> = {
  policy: 'topicPolicy',
  k12: 'topicK12',
  'higher-ed': 'topicHigherEd',
  teaching: 'topicTeaching',
  tools: 'topicTools',
  research: 'topicResearch',
  integrity: 'topicIntegrity',
  workforce: 'topicWorkforce',
};

const categoryKeys: Record<Source['category'], MessageKey> = {
  'vendor-education': 'categoryVendorEducation',
  policy: 'categoryPolicy',
  research: 'categoryResearch',
  'edtech-news': 'categoryEdtechNews',
  practitioner: 'categoryPractitioner',
  'taiwan-local': 'categoryTaiwanLocal',
};

const tierKeys: Record<Source['tier'], MessageKey> = {
  'first-party': 'tierFirstParty',
  institution: 'tierInstitution',
  media: 'tierMedia',
  research: 'tierResearch',
  community: 'tierCommunity',
};

const regionKeys: Record<string, MessageKey> = {
  GLOBAL: 'regionGlobal',
  TW: 'regionTaiwan',
  US: 'regionUS',
  EU: 'regionEU',
  UK: 'regionUK',
  CN: 'regionCN',
  JP: 'regionJP',
  APAC: 'regionAPAC',
  EE: 'regionEE',
};

export function formatTopic(locale: Locale, topic: Topic): string {
  return t(locale, topicKeys[topic]);
}

export function formatCategory(locale: Locale, category: Source['category']): string {
  return t(locale, categoryKeys[category]);
}

export function formatTier(locale: Locale, tier: Source['tier']): string {
  return t(locale, tierKeys[tier]);
}

/** Known region codes render localized; unknown codes render verbatim rather
 *  than guessing — honest raw data beats an invented translation. */
export function formatRegion(locale: Locale, region: string): string {
  const key = regionKeys[region];
  return key ? t(locale, key) : region;
}

/** Publication day only. Times are noise in a weekly digest. */
export function formatPublishedDate(isoDateTime: string): string {
  return isoDateTime.slice(0, 10);
}

/**
 * Which headline to show as primary, and which to keep visible underneath.
 * The original is never discarded: it is the reader's check on the machine.
 */
export function primaryHeadline(locale: Locale, story: Story): string {
  if (locale === 'en') return story.title;
  return story.titleZhTW ?? story.title;
}

export function showsTranslatedHeadline(locale: Locale, story: Story): boolean {
  return locale !== 'en' && story.titleZhTW !== null;
}

export interface SummaryView {
  text: string;
  badgeKey: MessageKey | null;
  isMachine: boolean;
}

/**
 * English readers get the source's own words whenever they exist — running
 * them through a Chinese-summarising model and back would add error for no
 * gain. Chinese readers get the machine summary when there is one, and the
 * source's verbatim summary otherwise.
 */
export function summaryView(locale: Locale, story: Story): SummaryView | null {
  if (locale === 'en') {
    if (story.summaryOriginal.length > 0) {
      return {
        text: story.summaryOriginal,
        badgeKey: 'storySourceSummaryBadge',
        isMachine: false,
      };
    }
    return null;
  }

  if (story.summarySource === 'machine' && story.summaryZhTW !== null) {
    return { text: story.summaryZhTW, badgeKey: 'storyMachineSummaryBadge', isMachine: true };
  }
  if (story.summaryOriginal.length > 0) {
    return {
      text: story.summaryOriginal,
      badgeKey: 'storySourceSummaryBadge',
      isMachine: false,
    };
  }
  return null;
}

export function countText(locale: Locale, key: MessageKey, count: number): string {
  return t(locale, key).replace('{count}', String(count));
}
