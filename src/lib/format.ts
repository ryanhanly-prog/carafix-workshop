import { format, parseISO } from "date-fns"

const AUD = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" })

/**
 * Display an AUD amount, e.g. `$1,234.50`. Null/undefined renders as an em
 * dash. Centralised so the quote editor, customer PDF, and workshop PDF all
 * format the same way — extracted from a previous inline definition in the
 * quote editor.
 */
export function formatMoney(n: number | null | undefined): string {
  if (n == null) return "—"
  return AUD.format(n)
}

/** Display a DB date (ISO string) as `DD MMM YYYY`, e.g. "28 May 2026". */
export function formatDate(date: string | null | undefined): string {
  if (!date) return "—"
  try {
    return format(parseISO(date), "dd MMM yyyy")
  } catch {
    return "—"
  }
}

/** Last whitespace-separated token of a name, for compact list columns. */
export function surname(fullName: string | null | undefined): string {
  if (!fullName) return ""
  const parts = fullName.trim().split(/\s+/)
  return parts[parts.length - 1] ?? ""
}

/** Whole days an ETA is past today; 0 or negative means not overdue. */
export function daysOverdue(eta: string | null | undefined): number {
  if (!eta) return 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const etaDate = parseISO(eta)
  etaDate.setHours(0, 0, 0, 0)
  const diff = Math.floor((today.getTime() - etaDate.getTime()) / 86_400_000)
  return diff > 0 ? diff : 0
}
