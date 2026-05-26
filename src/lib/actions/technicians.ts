"use server"

import { createClient } from "@/lib/supabase/server"
import { getCurrentOrgId } from "@/lib/actions/org"
import type { Enums } from "@/lib/database.types"

export type TechnicianInput = {
  name: string
  email?: string
  role: Enums<"tech_role">
  locationId: string
  productiveHoursPerDay?: number
  weeklyCapacityHours?: number
}

export async function createTechnician(
  input: TechnicianInput
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const organisationId = await getCurrentOrgId(supabase)
  if (!organisationId) return { error: "No organisation for current user." }
  const { error } = await supabase.from("technicians").insert({
    name: input.name.trim(),
    email: input.email?.trim() || null,
    role: input.role,
    location_id: input.locationId,
    productive_hours_per_day: input.productiveHoursPerDay ?? 6.5,
    weekly_capacity_hours: input.weeklyCapacityHours ?? 32.5,
    active: true,
    organisation_id: organisationId,
  })
  if (error) return { error: error.message }
  return {}
}

export async function updateTechnician(
  techId: string,
  patch: {
    name?: string
    email?: string | null
    role?: Enums<"tech_role">
    location_id?: string
    productive_hours_per_day?: number
    weekly_capacity_hours?: number
  }
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("technicians")
    .update(patch)
    .eq("id", techId)
  if (error) return { error: error.message }
  return {}
}

export async function setTechnicianActive(
  techId: string,
  active: boolean
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("technicians")
    .update({ active })
    .eq("id", techId)
  if (error) return { error: error.message }
  return {}
}
