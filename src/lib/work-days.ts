import { addBusinessDays, format } from "date-fns"

/** Next working day after `from` (skips weekends; holidays ignored for now). */
export function nextWorkingDay(from: Date = new Date()): Date {
  return addBusinessDays(from, 1)
}

/**
 * expected_finish_date = planned_start + ceil(quoted_hours / 6.5) working days.
 * Weekends are skipped; holidays are ignored for now.
 */
export function expectedFinishDate(
  plannedStart: Date,
  quotedHours: number
): Date {
  const days = Math.max(1, Math.ceil((quotedHours || 0) / 6.5))
  return addBusinessDays(plannedStart, days)
}

/** Format a Date as a `yyyy-MM-dd` string for a Postgres `date` column. */
export function toDateString(date: Date): string {
  return format(date, "yyyy-MM-dd")
}
