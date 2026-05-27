"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { getCurrentOrgId } from "@/lib/actions/org"

export type InsurerInput = {
  name: string
  capped_labour_rate: number
  notes?: string | null
}

export async function createInsurer(
  input: InsurerInput
): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()
  const organisationId = await getCurrentOrgId(supabase)
  if (!organisationId) return { error: "No organisation for current user." }
  const name = input.name.trim()
  if (!name) return { error: "Name is required." }
  if (!(input.capped_labour_rate >= 0)) return { error: "Capped labour rate must be a number." }

  const { data, error } = await supabase
    .from("insurers")
    .insert({
      organisation_id: organisationId,
      name,
      capped_labour_rate: input.capped_labour_rate,
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single()
  if (error) return { error: error.message }
  revalidatePath("/settings/insurers")
  return { id: data.id }
}

export async function updateInsurer(
  id: string,
  patch: Partial<InsurerInput> & { is_active?: boolean }
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const update: {
    name?: string
    capped_labour_rate?: number
    notes?: string | null
    is_active?: boolean
  } = {}
  if (patch.name !== undefined) {
    const n = patch.name.trim()
    if (!n) return { error: "Name is required." }
    update.name = n
  }
  if (patch.capped_labour_rate !== undefined) update.capped_labour_rate = patch.capped_labour_rate
  if (patch.notes !== undefined) update.notes = patch.notes?.trim() || null
  if (patch.is_active !== undefined) update.is_active = patch.is_active

  const { error } = await supabase.from("insurers").update(update).eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/settings/insurers")
  return {}
}
