"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { getCurrentOrgId } from "@/lib/actions/org"

const PATH = "/settings/job-types"

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

export async function createCanonical(input: {
  name: string
  category?: string | null
}): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()
  const organisationId = await getCurrentOrgId(supabase)
  if (!organisationId) return { error: "No organisation for current user." }
  const name = input.name.trim()
  if (!name) return { error: "Name is required." }
  const slug = slugify(name) || `type_${Date.now()}`

  const { data, error } = await supabase
    .from("job_type_canonical")
    .insert({
      organisation_id: organisationId,
      slug,
      name,
      category: input.category?.trim() || null,
    })
    .select("id")
    .single()
  if (error) return { error: error.message }
  revalidatePath(PATH)
  return { id: data.id }
}

export async function updateCanonical(
  id: string,
  patch: { name?: string; category?: string | null; active?: boolean }
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const update: { name?: string; category?: string | null; active?: boolean } = {}
  if (patch.name !== undefined) {
    const n = patch.name.trim()
    if (!n) return { error: "Name is required." }
    update.name = n
  }
  if (patch.category !== undefined) update.category = patch.category?.trim() || null
  if (patch.active !== undefined) update.active = patch.active

  const { error } = await supabase.from("job_type_canonical").update(update).eq("id", id)
  if (error) return { error: error.message }
  revalidatePath(PATH)
  return {}
}

export async function mapAlias(
  aliasId: string,
  canonicalId: string | null
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("job_type_aliases")
    .update({ canonical_id: canonicalId })
    .eq("id", aliasId)
  if (error) return { error: error.message }
  revalidatePath(PATH)
  return {}
}

export async function updateJobTypeDefault(
  id: string,
  patch: {
    labour_rate_source?: string
    workshop_retail_rate?: number | null
    markup_floor_pct?: number
    markup_default_pct?: number
    notes?: string | null
  }
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const update: {
    labour_rate_source?: string
    workshop_retail_rate?: number | null
    markup_floor_pct?: number
    markup_default_pct?: number
    notes?: string | null
  } = {}
  if (patch.labour_rate_source !== undefined) update.labour_rate_source = patch.labour_rate_source
  if (patch.workshop_retail_rate !== undefined) update.workshop_retail_rate = patch.workshop_retail_rate
  if (patch.markup_floor_pct !== undefined) update.markup_floor_pct = patch.markup_floor_pct
  if (patch.markup_default_pct !== undefined) update.markup_default_pct = patch.markup_default_pct
  if (patch.notes !== undefined) update.notes = patch.notes?.trim() || null

  const { error } = await supabase.from("job_type_defaults").update(update).eq("id", id)
  if (error) return { error: error.message }
  revalidatePath(PATH)
  return {}
}

/** Apply every suggestion above the confidence threshold to still-unmapped aliases. */
export async function acceptAllSuggestions(
  minConfidence = 0.7
): Promise<{ error?: string; count?: number }> {
  const supabase = await createClient()
  const { data: rows, error } = await supabase
    .from("job_type_aliases")
    .select("id, suggested_canonical_id")
    .is("canonical_id", null)
    .not("suggested_canonical_id", "is", null)
    .gt("suggestion_confidence", minConfidence)
  if (error) return { error: error.message }

  // Group by target canonical so we can update in a few statements.
  const groups = new Map<string, string[]>()
  for (const r of rows ?? []) {
    const cid = r.suggested_canonical_id as string | null
    if (!cid) continue
    const list = groups.get(cid) ?? []
    list.push(r.id)
    groups.set(cid, list)
  }
  for (const [cid, ids] of groups) {
    const { error: upErr } = await supabase
      .from("job_type_aliases")
      .update({ canonical_id: cid })
      .in("id", ids)
    if (upErr) return { error: upErr.message }
  }
  revalidatePath(PATH)
  return { count: rows?.length ?? 0 }
}

/** Map every still-unmapped alias to the org's "Other" canonical type. */
export async function mapRemainingToOther(): Promise<{ error?: string; count?: number }> {
  const supabase = await createClient()
  const organisationId = await getCurrentOrgId(supabase)
  if (!organisationId) return { error: "No organisation for current user." }

  const { data: other } = await supabase
    .from("job_type_canonical")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("slug", "other")
    .maybeSingle()
  if (!other) return { error: "No 'Other' canonical type found." }

  const { data: updated, error } = await supabase
    .from("job_type_aliases")
    .update({ canonical_id: other.id })
    .is("canonical_id", null)
    .select("id")
  if (error) return { error: error.message }
  revalidatePath(PATH)
  return { count: updated?.length ?? 0 }
}
