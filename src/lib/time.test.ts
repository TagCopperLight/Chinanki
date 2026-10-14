import { describe, expect, it } from 'vitest';
import { formatInterval, startOfStudyDay, studyDayKey } from '@/lib/time';

/** Local-time constructor so these assertions hold in any timezone. */
function local(y: number, m: number, d: number, h = 0, min = 0): number {
  return new Date(y, m - 1, d, h, min, 0, 0).getTime();
}

describe('startOfStudyDay', () => {
  it('returns 04:00 today for a timestamp after the rollover', () => {
    expect(startOfStudyDay(local(2026, 3, 10, 13, 30), 4)).toBe(local(2026, 3, 10, 4));
  });

  it('returns 04:00 yesterday for a timestamp before the rollover', () => {
    expect(startOfStudyDay(local(2026, 3, 10, 2, 15), 4)).toBe(local(2026, 3, 9, 4));
  });

  it('treats the rollover hour itself as the new day', () => {
    expect(startOfStudyDay(local(2026, 3, 10, 4, 0), 4)).toBe(local(2026, 3, 10, 4));
  });

  it('supports a midnight rollover', () => {
    expect(startOfStudyDay(local(2026, 3, 10, 2, 15), 0)).toBe(local(2026, 3, 10, 0));
  });
});

describe('studyDayKey', () => {
  it('labels a 2am session with the previous calendar date', () => {
    expect(studyDayKey(local(2026, 3, 10, 2, 15), 4)).toBe('2026-03-09');
  });

  it('zero-pads month and day', () => {
    expect(studyDayKey(local(2026, 1, 5, 12), 4)).toBe('2026-01-05');
  });
});

describe('formatInterval', () => {
  it('shows sub-day intervals in minutes', () => {
    expect(formatInterval(1 / 24 / 6)).toBe('10m');
  });

  it('shows hours between one hour and one day', () => {
    expect(formatInterval(0.25)).toBe('6h');
  });

  it('shows days below a month', () => {
    expect(formatInterval(21)).toBe('21d');
  });

  it('shows months below a year', () => {
    expect(formatInterval(75)).toBe('2.5mo');
  });

  it('shows years above a year', () => {
    expect(formatInterval(438)).toBe('1.2y');
  });
});
