// Publication dates, one publisher at a time.
//
// The weekly issue is assigned from this value, so an error here does not
// degrade a story — it files it in the wrong week or drops it. Every publisher
// writes the date somewhere different, and one of them writes it in prose.
//
// The rule that matters most: NEVER invent a day. A month-only value is
// reported as month-only and rejected upstream, because guessing the first of
// the month puts a late-in-the-month article outside a window that only moves
// forward. That story would never be published and would leave no trace.

import type { RawFeedItem } from './contracts';

export type DateStrategy = 'prose' | 'dcdate' | 'atom' | 'rss';

export interface ResolvedDate {
  /** ISO 8601, or null when the date is unusable or imprecise. */
  iso: string | null;
  /** 'day' when a real date was read, 'month' when only a month, null when none. */
  precision: 'day' | 'month' | null;
  /** What the feed actually said, for the run report's per-item detail. */
  rawValue: string;
}

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/**
 * ScienceDirect, which writes the date in prose and in two different forms.
 *
 *   "Publication date: Available online 22 August 2026"  — online-first, not
 *   yet in an issue. This is the date this site files by.
 *
 *   "Publication date: August 2026"  — already assigned to an issue. The day
 *   is not recoverable from the feed, and the article's online-first date was
 *   weeks or months earlier.
 *
 * Measured on Computers in Human Behavior: Artificial Humans, 2026-08-26: 18
 * of 99 items were online-first and 81 were issue-dated. The 81 are real
 * research articles, not front matter — so unlike the Cell Press case, this is
 * the common form, not a rarity.
 *
 * They are still rejected rather than guessed. A weekly run catches these
 * articles while they are online-first, which is when they are new; admitting
 * them at issue assignment would publish months-old work as this week's, and
 * guessing the first of the month would file them in a week that has passed.
 *
 * The consequence to be aware of: a site starting from nothing cannot reach
 * this backlog at all. That is the cost of never inventing a date, and it is
 * paid once.
 */
function fromProse(text: string): ResolvedDate {
  const full = text.match(/Available online (\d{1,2}) ([A-Za-z]+) (\d{4})/i);
  if (full) {
    const month = MONTHS.indexOf(full[2]!.toLowerCase());
    if (month >= 0) {
      return {
        iso: new Date(Date.UTC(Number(full[3]), month, Number(full[1]))).toISOString(),
        precision: 'day',
        rawValue: full[0],
      };
    }
  }
  // "Publication date: August 2026" — an issue date, not an online-first one.
  const monthOnly = text.match(/Publication date:\s*([A-Za-z]+ \d{4})/i);
  if (monthOnly) return { iso: null, precision: 'month', rawValue: monthOnly[1]! };
  return { iso: null, precision: null, rawValue: text.slice(0, 60) };
}

const MONTH_ONLY = /^\d{4}-\d{1,2}$/;

export function resolvePublishedAt(strategy: DateStrategy, item: RawFeedItem): ResolvedDate {
  if (strategy === 'prose') return fromProse(item.summary);

  const raw = item.publishedAtRaw.trim();
  if (raw.length === 0) return { iso: null, precision: null, rawValue: '' };

  // Checked before parsing, because Date() turns '2026-08' into 2026-08-01.
  if (MONTH_ONLY.test(raw)) return { iso: null, precision: 'month', rawValue: raw };

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return { iso: null, precision: null, rawValue: raw };
  return { iso: parsed.toISOString(), precision: 'day', rawValue: raw };
}
