"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { getCurrentOrgId } from "@/lib/actions/org"

export type SupplierInput = {
  name: string
  primary_contact_name?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  address?: string | null
  account_number?: string | null
  payment_terms?: string | null
  notes?: string | null
}

function clean(v?: string | null): string | null {
  const t = (v ?? "").trim()
  return t === "" ? null : t
}

function contactFields(input: SupplierInput) {
  return {
    primary_contact_name: clean(input.primary_contact_name),
    phone: clean(input.phone),
    email: clean(input.email),
    website: clean(input.website),
    address: clean(input.address),
    account_number: clean(input.account_number),
    payment_terms: clean(input.payment_terms),
    notes: clean(input.notes),
  }
}

export async function createSupplier(
  input: SupplierInput
): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()
  const organisationId = await getCurrentOrgId(supabase)
  if (!organisationId) return { error: "No organisation for current user." }
  const name = input.name.trim()
  if (!name) return { error: "Name is required." }

  const { data, error } = await supabase
    .from("suppliers")
    .insert({ name, organisation_id: organisationId, ...contactFields(input) })
    .select("id")
    .single()
  if (error) return { error: error.message }
  revalidatePath("/parts/suppliers")
  return { id: data.id }
}

export async function updateSupplier(
  id: string,
  input: SupplierInput
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const name = input.name.trim()
  if (!name) return { error: "Name is required." }

  // RLS scopes the update to the caller's org; no explicit org filter needed.
  const { error } = await supabase
    .from("suppliers")
    .update({ name, ...contactFields(input) })
    .eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/parts/suppliers")
  return {}
}
