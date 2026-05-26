"use server"

import { createClient } from "@/lib/supabase/server"
import { getCurrentOrgId } from "@/lib/actions/org"
import { toDateString } from "@/lib/work-days"
import type { Enums } from "@/lib/database.types"

export type PartInput = {
  description: string
  supplier?: string
  quantity?: number
  is_critical: boolean
  status: Enums<"part_status">
  ordered_date?: string | null
  eta_date?: string | null
}

export async function createPart(
  jobId: string,
  input: PartInput
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const organisationId = await getCurrentOrgId(supabase)
  if (!organisationId) return { error: "No organisation for current user." }
  const { error } = await supabase.from("parts").insert({
    job_id: jobId,
    description: input.description.trim(),
    supplier: input.supplier?.trim() || null,
    quantity: input.quantity ?? 1,
    is_critical: input.is_critical,
    status: input.status,
    ordered_date: input.ordered_date || null,
    eta_date: input.eta_date || null,
    organisation_id: organisationId,
  })
  if (error) return { error: error.message }
  return {}
}

export async function updatePart(
  partId: string,
  patch: Partial<PartInput> & { received_date?: string | null }
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from("parts").update(patch).eq("id", partId)
  if (error) return { error: error.message }
  return {}
}

export async function deletePart(partId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from("parts").delete().eq("id", partId)
  if (error) return { error: error.message }
  return {}
}

/**
 * Mark a part received. If its parent job is On Hold waiting on parts and no
 * critical parts remain outstanding, move the job back to In Progress and clear
 * the hold reason.
 */
export async function markPartReceived(
  partId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: part, error } = await supabase
    .from("parts")
    .update({ status: "Received", received_date: toDateString(new Date()) })
    .eq("id", partId)
    .select("job_id")
    .single()
  if (error) return { error: error.message }

  const { data: job } = await supabase
    .from("jobs")
    .select("status, hold_reason")
    .eq("id", part.job_id)
    .single()

  if (job?.status === "On Hold" && job.hold_reason === "Waiting on parts") {
    const { count } = await supabase
      .from("parts")
      .select("id", { count: "exact", head: true })
      .eq("job_id", part.job_id)
      .eq("is_critical", true)
      .in("status", ["Needed", "Ordered"])
    if ((count ?? 0) === 0) {
      await supabase
        .from("jobs")
        .update({ status: "In Progress", hold_reason: null })
        .eq("id", part.job_id)
    }
  }
  return {}
}
