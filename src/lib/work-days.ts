import { addBusinessDays, differenceInBusinessDays, format, parseISO } from "date-fns"

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

/**
 * Inclusive working-day progress between a job's start and expected finish,
 * clamped so "today" never reads before day 1 or past the final day. Used for
 * the dashboard "Day X of Y" indicator. Returns null if either date is missing.
 */
export function workingDayProgress(
  start: string | null | undefined,
  finish: string | null | undefined
): { day: number; total: number } | null {
  if (!start || !finish) return null
  const startDate = parseISO(start)
  const finishDate = parseISO(finish)
  const total = Math.max(1, differenceInBusinessDays(finishDate, startDate) + 1)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const elapsed = differenceInBusinessDays(today, startDate) + 1
  const day = Math.min(Math.max(elapsed, 1), total)
  return { day, total }
}
