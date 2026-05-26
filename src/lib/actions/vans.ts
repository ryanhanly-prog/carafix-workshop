"use server"

import { createClient } from "@/lib/supabase/server"

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
  const { data, error } = await supabase
    .from("vans")
    .insert({
      customer_id: input.customerId,
      make: input.make?.trim() || null,
      model: input.model?.trim() || null,
      year: input.year ?? null,
      rego: input.rego?.trim() || null,
    })
    .select("id")
    .single()
  if (error) return { error: error.message }
  return { id: data.id }
}
