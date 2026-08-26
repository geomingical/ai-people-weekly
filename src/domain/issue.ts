// ISO-8601 week helpers. The issue label ("2026-W34") is the product's spine:
// it decides which stories share a page, and it is computed once at ingest and
// frozen on the record so a story never drifts between issues on a later run.
//
// ISO week rules, restated because they trip people up: weeks start on Monday,
// and week 1 is the week containing the first Thursday of the year. So
// 2026-01-01 can legitimately belong to 2025-W53.

const MS_PER_DAY = 86_400_000;

function toUtcMidnight(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/** The Thursday of the ISO week containing `date`. Week identity lives here. */
function isoThursday(date: Date): Date {
  const day = toUtcMidnight(date);
  // getUTCDay(): Sunday = 0. Shift so Monday = 0 … Sunday = 6.
  const isoDayIndex = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() + (3 - isoDayIndex) * MS_PER_DAY);
}

export function isoWeekOf(date: Date): { year: number; week: number } {
  const thursday = isoThursday(date);
  const year = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const firstThursday = isoThursday(jan4);
  const week =
    1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * MS_PER_DAY));
  return { year, week };
}

/** "2026-W34". Zero-padded so labels sort lexicographically in date order. */
export function issueLabel(date: Date): string {
  const { year, week } = isoWeekOf(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function issueLabelFromIso(isoDateTime: string): string {
  const parsed = new Date(isoDateTime);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`invalid ISO date-time: ${isoDateTime}`);
  }
  return issueLabel(parsed);
}

export function isIssueLabel(value: string): boolean {
  return /^\d{4}-W\d{2}$/.test(value);
}

/** Monday 00:00 UTC of the given issue. */
export function issueStartDate(label: string): Date {
  const match = /^(\d{4})-W(\d{2})$/.exec(label);
  if (!match) throw new Error(`invalid issue label: ${label}`);
  const year = Number(match[1]);
  const week = Number(match[2]);

  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4IsoDayIndex = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4.getTime() - jan4IsoDayIndex * MS_PER_DAY);
  return new Date(week1Monday.getTime() + (week - 1) * 7 * MS_PER_DAY);
}

/** Sunday 00:00 UTC of the given issue (the last day it covers). */
export function issueEndDate(label: string): Date {
  return new Date(issueStartDate(label).getTime() + 6 * MS_PER_DAY);
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "2026-08-17 – 2026-08-23". Same string in both locales; dates are neutral. */
export function issueDateRange(label: string): string {
  return `${isoDay(issueStartDate(label))} – ${isoDay(issueEndDate(label))}`;
}

/** Newest issue first. Lexicographic order is chronological for this format. */
export function sortIssuesDescending(labels: readonly string[]): string[] {
  return [...labels].sort((left, right) => right.localeCompare(left, 'en'));
}
