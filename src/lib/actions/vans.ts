"use server"

import { createClient } from "@/lib/supabase/server"
import { getCurrentOrgId } from "@/lib/actions/org"

export type CreateVanInput = {
  customerId: string
  make?: string
  model?: string
  year?: number | null
  rego?: string
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
