import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/database.types"

/**
 * Shared view-model used by all four output renderers (customer HTML + PDF,
 * workshop HTML + PDF). Built server-side from quotes + organisations +
 * locations + quote_line_items so each renderer reads denormalised data from
 * one place — there is no second source of truth for the figures that end up
 * in front of a customer or insurer.
 *
 * - Workshop NAME and ABN come from the organisations row (tenant-level).
 * - Workshop ADDRESS, PHONE, EMAIL come from the locations row pointed at by
 *   the quote's location_id (site-level). When location_id is null the
 *   renderer gracefully degrades to name + ABN only.
 * - Subtotals are read straight from the stored quotes.subtotal_* and
 *   quotes.total columns — never recomputed (single source of truth, matches
 *   what the editor's sticky footer shows).
 */
export type QuoteLineForOutput = {
  /** Sequential 1-based number over non-divider rows; null for dividers. */
  displayNumber: number | null
  /** Mirrors isSectionDivider() in quote-editor.tsx — line_type='other' with
   * quantity/unit_cost/line_total all zero. Rendered as a bold subheading. */
  isDivider: boolean
  lineType: string
  description: string
  /** For labour lines, " (6 hrs @ $140.91/hr)" — appended to description by
   * each renderer. Null for non-labour or when rate/qty are missing. */
  labourSuffix: string | null
  quantity: number | null
  unit: string | null
  unitCost: number | null
  markupPct: number | null
  unitPrice: number | null
  lineTotal: number | null
  /** (unit_price - unit_cost) * quantity, 0 for dividers/missing data. */
  marginDollars: number
  /** marginDollars / line_total; null when line_total is 0/null. */
  marginPct: number | null
}

export type QuoteOutputModel = {
  quote: {
    id: string
    quoteNumber: string | null
    status: string
    /** ISO timestamp — sent_at if set (the moment it was issued), else
     * created_at as a fallback so a draft quote can still preview. */
    dateIssued: string | null
    description: string | null
    jobTypeName: string | null
  }
  customer: { name: string | null } | null
  vehicle: { make: string | null; model: string | null; year: number | null; rego: string | null } | null
  insurer: { name: string; cappedLabourRate: number | null } | null
  workshop: {
    name: string
    abn: string | null
    address: string | null
    phone: string | null
    email: string | null
    locationName: string | null
  }
  audit: {
    createdByName: string | null
    createdAt: string | null
    updatedAt: string | null
    status: string
  }
  lines: QuoteLineForOutput[]
  totals: {
    parts: number | null
    labour: number | null
    consumables: number | null
    other: number | null
    total: number | null
    /** Sum over non-divider lines of (unit_price - unit_cost) * quantity. */
    marginDollars: number
    /** marginDollars / sum(line_total); null when revenue is 0. */
    marginPct: number | null
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Cloned from quote-editor.tsx:104 — must stay in sync. */
function isSectionDivider(l: {
  line_type: string | null
  quantity: number | null
  unit_cost: number | null
  line_total: number | null
}): boolean {
  return (
    l.line_type === "other" &&
    (l.quantity ?? 0) === 0 &&
    (l.unit_cost ?? 0) === 0 &&
    (l.line_total ?? 0) === 0
  )
}

function labourSuffix(l: {
  line_type: string | null
  quantity: number | null
  unit_price: number | null
}): string | null {
  if (l.line_type !== "labour") return null
  if (l.quantity == null || l.unit_price == null) return null
  const hrs = Number(l.quantity)
  const rate = Number(l.unit_price)
  if (!Number.isFinite(hrs) || !Number.isFinite(rate)) return null
  // 6 -> "6", 9.5 -> "9.5" (no trailing zeros); rate -> "$140.91" (2dp).
  const hrsStr = Number.isInteger(hrs) ? String(hrs) : String(hrs)
  const rateStr = rate.toFixed(2)
  return ` (${hrsStr} hrs @ $${rateStr}/hr)`
}

/**
 * Fetch and assemble a QuoteOutputModel for the given quote id. Returns null
 * when the quote is not found (RLS-scoped). Two parallel queries plus a
 * conditional locations lookup; no recompute of stored totals.
 */
export async function getQuoteForOutput(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<QuoteOutputModel | null> {
  // Embed customer/vans/insurer/job-type/created-by; the FK hint on created_by
  // disambiguates from any future second app_users relationship.
  const headerSelect =
    "id, organisation_id, location_id, quote_number, status, description, total, " +
    "subtotal_parts, subtotal_labour, subtotal_consumables, subtotal_other, " +
    "sent_at, created_at, updated_at, " +
    "customers(name), " +
    "vans(make, model, year, rego), " +
    "insurers(name, capped_labour_rate), " +
    "job_type_canonical(name), " +
    "created_by_user:app_users!quotes_created_by_fkey(full_name)"

  const { data: q } = await supabase.from("quotes").select(headerSelect).eq("id", id).single()
  if (!q) return null

  // Loose type — the embed return shape is correct at runtime but PostgREST's
  // generated types don't always narrow nested singles to a single object.
  type EmbeddedQuote = {
    id: string
    organisation_id: string
    location_id: string | null
    quote_number: string | null
    status: string
    description: string | null
    total: number | null
    subtotal_parts: number | null
    subtotal_labour: number | null
    subtotal_consumables: number | null
    subtotal_other: number | null
    sent_at: string | null
    created_at: string | null
    updated_at: string | null
    customers: { name: string | null } | null
    vans: { make: string | null; model: string | null; year: number | null; rego: string | null } | null
    insurers: { name: string; capped_labour_rate: number | null } | null
    job_type_canonical: { name: string | null } | null
    created_by_user: { full_name: string | null } | null
  }
  const quote = q as unknown as EmbeddedQuote

  // Organisation (tenant branding) + location (site contact) + lines, in parallel.
  const [{ data: org }, locResult, { data: lineRows }] = await Promise.all([
    supabase
      .from("organisations")
      .select("name, trading_name, abn")
      .eq("id", quote.organisation_id)
      .single(),
    quote.location_id
      ? supabase
          .from("locations")
          .select("name, address, phone, email")
          .eq("id", quote.location_id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from("quote_line_items")
      .select(
        "line_order, line_type, description, quantity, unit, unit_cost, markup_pct, unit_price, line_total",
      )
      .eq("quote_id", id)
      .order("line_order"),
  ])

  const loc = (locResult.data ?? null) as {
    name: string | null
    address: string | null
    phone: string | null
    email: string | null
  } | null

  // Build the line list with derived flags. displayNumber is sequential over
  // non-divider rows; dividers have no number, no totals, no margin.
  let displayCounter = 0
  let marginAccum = 0
  let revenueAccum = 0
  const lines: QuoteLineForOutput[] = (lineRows ?? []).map((raw) => {
    const divider = isSectionDivider(raw)
    let displayNumber: number | null = null
    if (!divider) {
      displayCounter += 1
      displayNumber = displayCounter
    }
    const qty = raw.quantity == null ? null : Number(raw.quantity)
    const unitCost = raw.unit_cost == null ? null : Number(raw.unit_cost)
    const unitPrice = raw.unit_price == null ? null : Number(raw.unit_price)
    const lineTotal = raw.line_total == null ? null : Number(raw.line_total)
    let marginDollars = 0
    if (!divider && unitPrice != null && unitCost != null && qty != null) {
      marginDollars = round2((unitPrice - unitCost) * qty)
    }
    const marginPct = lineTotal && lineTotal !== 0 ? round2((marginDollars / lineTotal) * 100) : null
    if (!divider) {
      marginAccum += marginDollars
      revenueAccum += lineTotal ?? 0
    }
    return {
      displayNumber,
      isDivider: divider,
      lineType: raw.line_type ?? "other",
      description: raw.description ?? "",
      labourSuffix: labourSuffix({
        line_type: raw.line_type,
        quantity: qty,
        unit_price: unitPrice,
      }),
      quantity: qty,
      unit: raw.unit ?? null,
      unitCost,
      markupPct: raw.markup_pct == null ? null : Number(raw.markup_pct),
      unitPrice,
      lineTotal,
      marginDollars,
      marginPct,
    }
  })

  const marginDollars = round2(marginAccum)
  const marginPct = revenueAccum !== 0 ? round2((marginDollars / revenueAccum) * 100) : null

  const workshopName =
    org?.trading_name?.trim() || org?.name?.trim() || "Workshop"

  return {
    quote: {
      id: quote.id,
      quoteNumber: quote.quote_number,
      status: quote.status,
      dateIssued: quote.sent_at ?? quote.created_at,
      description: quote.description,
      jobTypeName: quote.job_type_canonical?.name ?? null,
    },
    customer: quote.customers ? { name: quote.customers.name } : null,
    vehicle: quote.vans
      ? {
          make: quote.vans.make,
          model: quote.vans.model,
          year: quote.vans.year,
          rego: quote.vans.rego,
        }
      : null,
    insurer: quote.insurers
      ? { name: quote.insurers.name, cappedLabourRate: quote.insurers.capped_labour_rate }
      : null,
    workshop: {
      name: workshopName,
      abn: org?.abn ?? null,
      address: loc?.address ?? null,
      phone: loc?.phone ?? null,
      email: loc?.email ?? null,
      locationName: loc?.name ?? null,
    },
    audit: {
      createdByName: quote.created_by_user?.full_name ?? null,
      createdAt: quote.created_at,
      updatedAt: quote.updated_at,
      status: quote.status,
    },
    lines,
    totals: {
      parts: quote.subtotal_parts == null ? null : Number(quote.subtotal_parts),
      labour: quote.subtotal_labour == null ? null : Number(quote.subtotal_labour),
      consumables: quote.subtotal_consumables == null ? null : Number(quote.subtotal_consumables),
      other: quote.subtotal_other == null ? null : Number(quote.subtotal_other),
      total: quote.total == null ? null : Number(quote.total),
      marginDollars,
      marginPct,
    },
  }
}
