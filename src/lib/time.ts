export const DAY_MS = 86_400_000;

/**
 * The start of the "study day" containing `timestamp`. A study day runs from
 * `rolloverHour` local time to `rolloverHour` the next day, so a 2am session
 * still belongs to the previous day's counts.
 */
export function startOfStudyDay(timestamp: number, rolloverHour: number): number {
  const date = new Date(timestamp);
  if (date.getHours() < rolloverHour) {
    date.setDate(date.getDate() - 1);
  }
  date.setHours(rolloverHour, 0, 0, 0);
  return date.getTime();
}

/** Stable `YYYY-MM-DD` key for the study day, used to bucket reviews. */
export function studyDayKey(timestamp: number, rolloverHour: number): string {
  const date = new Date(startOfStudyDay(timestamp, rolloverHour));
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Human-readable interval for the rating buttons, e.g. "10m", "3d", "2.5mo". */
export function formatInterval(days: number): string {
  if (days < 1 / 24) return `${Math.max(1, Math.round(days * 24 * 60))}m`;
  if (days < 1) return `${Math.round(days * 24)}h`;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${(days / 30).toFixed(1)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}
