/**
 * Per-line margin math, shared between the editor (inline display) and any
 * other surface that needs the same figure. The workshop PDF (quote-output.ts)
 * has the same math inlined for now — keeping them in sync by definition
 * here; a future refactor can collapse them.
 *
 * Math:
 *   marginDollars = (unit_price - unit_cost) * quantity
 *   marginPct     = marginDollars / line_total
 *
 * Callers decide display visibility (e.g. the editor hides margin on labour
 * and dividers per the 4c spec; the workshop PDF shows it on labour too).
 */

export type MarginInput = {
  line_type: string | null
  quantity: number | null
  unit_cost: number | null
  unit_price: number | null
  line_total: number | null
  /** When true, marginFor returns zero/null — pass from the caller's own
   * divider heuristic (the editor uses isSectionDivider in quote-editor.tsx). */
  isDivider?: boolean
}

export type MarginResult = {
  /** Always finite; 0 when inputs are missing or the line is a divider. */
  marginDollars: number
  /** Null when line_total is 0/null (no revenue to divide into). */
  marginPct: number | null
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function marginFor(line: MarginInput): MarginResult {
  if (line.isDivider) return { marginDollars: 0, marginPct: null }
  const qty = line.quantity == null ? null : Number(line.quantity)
  const unitCost = line.unit_cost == null ? null : Number(line.unit_cost)
  const unitPrice = line.unit_price == null ? null : Number(line.unit_price)
  const lineTotal = line.line_total == null ? null : Number(line.line_total)
  if (unitPrice == null || unitCost == null || qty == null) {
    return { marginDollars: 0, marginPct: null }
  }
  const marginDollars = round2((unitPrice - unitCost) * qty)
  const marginPct =
    lineTotal && lineTotal !== 0 ? round2((marginDollars / lineTotal) * 100) : null
  return { marginDollars, marginPct }
}

/**
 * Sum margin across a set of lines. Mirrors the accumulator in
 * quote-output.ts so the editor footer matches the workshop PDF footer.
 * Dividers and labour-with-no-data still contribute zero / nothing; the
 * caller is free to filter ahead of time if it wants stricter semantics
 * (e.g. exclude labour from "margin %" entirely).
 */
export function totalMargin(lines: MarginInput[]): MarginResult {
  let marginAccum = 0
  let revenueAccum = 0
  for (const l of lines) {
    if (l.isDivider) continue
    const { marginDollars } = marginFor(l)
    marginAccum += marginDollars
    revenueAccum += l.line_total ? Number(l.line_total) : 0
  }
  const marginDollars = round2(marginAccum)
  const marginPct =
    revenueAccum !== 0 ? round2((marginDollars / revenueAccum) * 100) : null
  return { marginDollars, marginPct }
}
