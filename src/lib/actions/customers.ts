"use server"

import { createClient } from "@/lib/supabase/server"
import { getCurrentOrgId } from "@/lib/actions/org"

export type CreateCustomerInput = {
  name: string
  phone?: string
  email?: string
}

export async function createCustomer(
  input: CreateCustomerInput
): Promise<{ error: string } | { id: string }> {
  const supabase = await createClient()
  const organisationId = await getCurrentOrgId(supabase)
  if (!organisationId) return { error: "No organisation for current user." }
  const { data, error } = await supabase
    .from("customers")
    .insert({
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      organisation_id: organisationId,
    })
    .select("id")
    .single()
  if (error) return { error: error.message }
  return { id: data.id }
}
