"use server"

import { revalidatePath } from "next/cache"

import type { SupabaseClient } from "@supabase/supabase-js"

import { createClient } from "@/lib/supabase/server"
import { getCurrentOrgId } from "@/lib/actions/org"

export type QuoteHeaderInput = {
  customer_id?: string | null
  vehicle_id?: string | null
  canonical_job_type_id: string
  insurer_id?: string | null
  description?: string | null
  damage_tags?: string[] | null
  // Workshop location the quote is being raised at. Captured on create so the
  // customer/workshop PDFs render the correct site address/phone/email; sticky
  // after that (the quote stays attached to the location it was raised at, even
  // if the user later switches the top-right location switcher).
  location_id?: string | null
}

export type LineType = "part" | "labour" | "consumable" | "freight" | "other"

export type LineItemInput = {
  line_type: LineType
  description: string
  quantity?: number
  unit?: string | null
  unit_cost?: number
  markup_pct?: number
  part_id?: string | null
  supplier_id?: string | null
  sku?: string | null // used to silently capture a stock_items stub when part_id is null
  notes?: string | null
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

function priceLine(unit_cost: number, markup_pct: number, quantity: number) {
  const unit_price = round2(unit_cost * (1 + markup_pct / 100))
  const line_total = round2(unit_price * quantity)
  return { unit_price, line_total }
}

export async function createQuote(
  input: QuoteHeaderInput
): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const organisationId = await getCurrentOrgId(supabase)
  if (!organisationId || !user) return { error: "No organisation for current user." }
  if (!input.canonical_job_type_id) return { error: "Job type is required." }

  // Location cascade: explicit input → user's default_location_id → null. We
  // never block the create on a missing location (the PDF renderer degrades
  // gracefully); the column is nullable for future-import compatibility.
  let locationId = input.location_id ?? null
  if (!locationId) {
    const { data: profile } = await supabase
      .from("app_users")
      .select("default_location_id")
      .eq("id", user.id)
      .single()
    locationId = profile?.default_location_id ?? null
  }

  const { data, error } = await supabase
    .from("quotes")
    .insert({
      organisation_id: organisationId,
      customer_id: input.customer_id || null,
      vehicle_id: input.vehicle_id || null,
      canonical_job_type_id: input.canonical_job_type_id,
      insurer_id: input.insurer_id || null,
      location_id: locationId,
      description: input.description?.trim() || null,
      damage_tags: input.damage_tags && input.damage_tags.length > 0 ? input.damage_tags : null,
      status: "draft",
      created_by: user.id,
    })
    .select("id")
    .single()
  if (error) return { error: error.message }
  revalidatePath("/quotes")
  return { id: data.id }
}

export async function updateQuoteHeader(
  id: string,
  patch: Partial<QuoteHeaderInput>
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const update: {
    customer_id?: string | null
    vehicle_id?: string | null
    canonical_job_type_id?: string
    insurer_id?: string | null
    description?: string | null
    damage_tags?: string[] | null
  } = {}
  if (patch.customer_id !== undefined) update.customer_id = patch.customer_id || null
  if (patch.vehicle_id !== undefined) update.vehicle_id = patch.vehicle_id || null
  if (patch.canonical_job_type_id !== undefined) update.canonical_job_type_id = patch.canonical_job_type_id
  if (patch.insurer_id !== undefined) update.insurer_id = patch.insurer_id || null
  if (patch.description !== undefined) update.description = patch.description?.trim() || null
  if (patch.damage_tags !== undefined)
    update.damage_tags = patch.damage_tags && patch.damage_tags.length > 0 ? patch.damage_tags : null

  const { error } = await supabase.from("quotes").update(update).eq("id", id)
  if (error) return { error: error.message }
  revalidatePath(`/quotes/${id}`)
  revalidatePath(`/quotes/${id}/edit`)
  return {}
}

export async function setQuoteStatus(
  id: string,
  status: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from("quotes").update({ status }).eq("id", id)
  if (error) return { error: error.message }
  revalidatePath(`/quotes/${id}`)
  revalidatePath(`/quotes/${id}/edit`)
  revalidatePath("/quotes")
  return {}
}

export async function addLineItem(
  quoteId: string,
  input: LineItemInput
): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()
  const organisationId = await getCurrentOrgId(supabase)
  if (!organisationId) return { error: "No organisation for current user." }

  const quantity = input.quantity ?? 1
  const unit_cost = input.unit_cost ?? 0
  const markup_pct = input.markup_pct ?? 0
  const { unit_price, line_total } = priceLine(unit_cost, markup_pct, quantity)

  // Silent parts-master capture: a part line with a SKU but no linked part.
  let partId = input.part_id || null
  if (input.line_type === "part" && !partId && input.sku && input.sku.trim()) {
    // Loose client: the generated rpc arg type marks the uuid supplier param as
    // non-null, but Postgres accepts null for an optional supplier.
    const looseRpc = supabase as unknown as SupabaseClient
    const { data: newPartId, error: rpcErr } = await looseRpc.rpc("silent_save_part", {
      p_organisation_id: organisationId,
      p_sku: input.sku.trim(),
      p_description: input.description,
      p_supplier_id: input.supplier_id || null,
      p_unit_cost: unit_cost,
    })
    if (rpcErr) return { error: rpcErr.message }
    if (newPartId) partId = newPartId as string
  }

  const { data: maxRow } = await supabase
    .from("quote_line_items")
    .select("line_order")
    .eq("quote_id", quoteId)
    .order("line_order", { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextOrder = (maxRow?.line_order ?? 0) + 1

  const { data, error } = await supabase
    .from("quote_line_items")
    .insert({
      organisation_id: organisationId,
      quote_id: quoteId,
      line_order: nextOrder,
      line_type: input.line_type,
      part_id: partId,
      supplier_id: input.supplier_id || null,
      description: input.description,
      quantity,
      unit: input.unit || null,
      unit_cost,
      markup_pct,
      unit_price,
      line_total,
      source: "manual",
      notes: input.notes || null,
    })
    .select("id")
    .single()
  if (error) return { error: error.message }
  revalidatePath(`/quotes/${quoteId}/edit`)
  return { id: data.id }
}

export async function updateLineItem(
  id: string,
  quoteId: string,
  patch: Partial<Pick<LineItemInput, "description" | "quantity" | "unit" | "unit_cost" | "markup_pct" | "line_type">>
): Promise<{ error?: string }> {
  const supabase = await createClient()

  // Need current values to recompute price when only some fields change.
  const { data: current, error: readErr } = await supabase
    .from("quote_line_items")
    .select("quantity, unit_cost, markup_pct")
    .eq("id", id)
    .single()
  if (readErr) return { error: readErr.message }

  const quantity = patch.quantity ?? current.quantity ?? 1
  const unit_cost = patch.unit_cost ?? current.unit_cost ?? 0
  const markup_pct = patch.markup_pct ?? current.markup_pct ?? 0
  const { unit_price, line_total } = priceLine(unit_cost, markup_pct, quantity)

  const update: {
    quantity: number
    unit_cost: number
    markup_pct: number
    unit_price: number
    line_total: number
    description?: string
    unit?: string | null
    line_type?: LineType
  } = { quantity, unit_cost, markup_pct, unit_price, line_total }
  if (patch.description !== undefined) update.description = patch.description
  if (patch.unit !== undefined) update.unit = patch.unit || null
  if (patch.line_type !== undefined) update.line_type = patch.line_type

  const { error } = await supabase.from("quote_line_items").update(update).eq("id", id)
  if (error) return { error: error.message }
  revalidatePath(`/quotes/${quoteId}/edit`)
  return {}
}

export async function deleteLineItem(
  id: string,
  quoteId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from("quote_line_items").delete().eq("id", id)
  if (error) return { error: error.message }
  revalidatePath(`/quotes/${quoteId}/edit`)
  return {}
}

/** Swap line_order with the adjacent line in the given direction. */
export async function moveLineItem(
  id: string,
  quoteId: string,
  direction: "up" | "down"
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: rows, error } = await supabase
    .from("quote_line_items")
    .select("id, line_order")
    .eq("quote_id", quoteId)
    .order("line_order", { ascending: true })
  if (error) return { error: error.message }
  const list = rows ?? []
  const idx = list.findIndex((r) => r.id === id)
  if (idx < 0) return {}
  const swapIdx = direction === "up" ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= list.length) return {}
  const a = list[idx]
  const b = list[swapIdx]
  await supabase.from("quote_line_items").update({ line_order: b.line_order }).eq("id", a.id)
  await supabase.from("quote_line_items").update({ line_order: a.line_order }).eq("id", b.id)
  revalidatePath(`/quotes/${quoteId}/edit`)
  return {}
}

export async function cloneIntoQuote(
  targetQuoteId: string,
  sourceQuoteId: string,
  sourceType: "live" | "historical"
): Promise<{ error?: string; count?: number }> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("clone_quote", {
    p_target_quote_id: targetQuoteId,
    p_source_quote_id: sourceQuoteId,
    p_source_type: sourceType,
  })
  if (error) return { error: error.message }
  revalidatePath(`/quotes/${targetQuoteId}/edit`)
  return { count: (data as number) ?? 0 }
}

export async function getLabourRate(quoteId: string): Promise<number | null> {
  const supabase = await createClient()
  const { data } = await supabase.rpc("compute_labour_rate", { p_quote_id: quoteId })
  return (data as number | null) ?? null
}
