"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { getCurrentOrgId } from "@/lib/actions/org"

export type CreateVanInput = {
  customerId: string
  make?: string
  model?: string
  year?: number | null
  rego?: string
}

export type UpdateVanInput = {
  make?: string | null
  model?: string | null
  year?: number | null
  rego?: string | null
  notes?: string | null
}

export async function updateVan(
  vanId: string,
  patch: UpdateVanInput
): Promise<{ error?: string }> {
  const supabase = await createClient()
  // A user edit marks the van manually_edited so future imports won't overwrite it.
  const update: {
    make?: string | null
    model?: string | null
    year?: number | null
    rego?: string | null
    notes?: string | null
    manually_edited: boolean
  } = { manually_edited: true }
  if (patch.make !== undefined) update.make = patch.make?.trim() || null
  if (patch.model !== undefined) update.model = patch.model?.trim() || null
  if (patch.year !== undefined) update.year = patch.year ?? null
  if (patch.rego !== undefined) update.rego = patch.rego?.trim() || null
  if (patch.notes !== undefined) update.notes = patch.notes?.trim() || null

  const { error } = await supabase.from("vans").update(update).eq("id", vanId)
  if (error) return { error: error.message }
  revalidatePath("/customers")
  return {}
}

export async function createVan(
  input: CreateVanInput
): Promise<{ error: string } | { id: string }> {
  const supabase = await createClient()
  const organisationId = await getCurrentOrgId(supabase)
  if (!organisationId) return { error: "No organisation for current user." }
  const { data, error } = await supabase
    .from("vans")
    .insert({
      customer_id: input.customerId,
      make: input.make?.trim() || null,
      model: input.model?.trim() || null,
      year: input.year ?? null,
      rego: input.rego?.trim() || null,
      organisation_id: organisationId,
    })
    .select("id")
    .single()
  if (error) return { error: error.message }
  return { id: data.id }
}
