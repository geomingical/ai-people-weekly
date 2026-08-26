import { describe, expect, it } from 'vitest';
import {
  issueDateRange,
  issueEndDate,
  issueLabel,
  issueLabelFromIso,
  issueStartDate,
  isIssueLabel,
  isoWeekOf,
  sortIssuesDescending,
} from '../../src/domain/issue';

describe('isoWeekOf', () => {
  it('puts a mid-week date in the expected week', () => {
    expect(isoWeekOf(new Date('2026-08-18T00:00:00Z'))).toEqual({ year: 2026, week: 34 });
  });

  // The rule that trips people up: ISO week 1 is the week containing the first
  // Thursday, so early-January dates can belong to the PREVIOUS ISO year.
  it('assigns 2027-01-01 (a Friday) to ISO week 53 of 2026', () => {
    expect(isoWeekOf(new Date('2027-01-01T00:00:00Z'))).toEqual({ year: 2026, week: 53 });
  });

  it('assigns 2026-01-01 (a Thursday) to week 1 of 2026', () => {
    expect(isoWeekOf(new Date('2026-01-01T00:00:00Z'))).toEqual({ year: 2026, week: 1 });
  });

  it('assigns 2025-12-29 (a Monday) to week 1 of 2026', () => {
    expect(isoWeekOf(new Date('2025-12-29T00:00:00Z'))).toEqual({ year: 2026, week: 1 });
  });
});

describe('issueLabel', () => {
  it('zero-pads the week so labels sort chronologically as strings', () => {
    expect(issueLabel(new Date('2026-01-08T00:00:00Z'))).toBe('2026-W02');
  });

  it('derives the same label from an ISO string', () => {
    expect(issueLabelFromIso('2026-08-18T09:00:00.000Z')).toBe('2026-W34');
  });

  it('throws on an unparseable date rather than inventing a week', () => {
    expect(() => issueLabelFromIso('not a date')).toThrow();
  });
});

describe('issue boundaries', () => {
  it('starts an issue on Monday and ends it on Sunday', () => {
    expect(issueStartDate('2026-W34').toISOString().slice(0, 10)).toBe('2026-08-17');
    expect(issueEndDate('2026-W34').toISOString().slice(0, 10)).toBe('2026-08-23');
  });

  it('round-trips a date through its label back into its own week', () => {
    const date = new Date('2026-03-11T18:30:00Z');
    const label = issueLabel(date);
    expect(date.getTime()).toBeGreaterThanOrEqual(issueStartDate(label).getTime());
    expect(date.getTime()).toBeLessThan(issueEndDate(label).getTime() + 86_400_000);
  });

  it('renders a readable date range', () => {
    expect(issueDateRange('2026-W34')).toBe('2026-08-17 – 2026-08-23');
  });

  it('rejects a malformed label', () => {
    expect(() => issueStartDate('2026-34')).toThrow();
    expect(isIssueLabel('2026-34')).toBe(false);
    expect(isIssueLabel('2026-W34')).toBe(true);
  });
});

describe('sortIssuesDescending', () => {
  it('puts the newest issue first across a year boundary', () => {
    expect(sortIssuesDescending(['2026-W02', '2025-W52', '2026-W10'])).toEqual([
      '2026-W10',
      '2026-W02',
      '2025-W52',
    ]);
  });
});
