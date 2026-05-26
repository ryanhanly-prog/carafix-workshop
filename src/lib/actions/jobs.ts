"use server"

import { parseISO } from "date-fns"

import { createClient } from "@/lib/supabase/server"
import { getCurrentOrgId } from "@/lib/actions/org"
import { expectedFinishDate, toDateString } from "@/lib/work-days"
import type { Enums } from "@/lib/database.types"

export type CreateJobInput = {
  locationId: string
  customerId: string
  vanId: string
  billingType: Enums<"billing_type">
  priority: Enums<"priority_level">
  jobType: Enums<"job_type">
  description?: string
  quotedHours: number
  assignedTechId?: string | null
  bayId?: string | null
  bookingDate: string
  jobStartDate: string
  customerPromisedDate?: string | null
  insuranceClaimNumber?: string
  warrantyReference?: string
}

export async function createJob(
  input: CreateJobInput
): Promise<{ error: string } | { id: string }> {
  const supabase = await createClient()
  const organisationId = await getCurrentOrgId(supabase)
  if (!organisationId) return { error: "No organisation for current user." }
  const expected = expectedFinishDate(
    parseISO(input.jobStartDate),
    input.quotedHours
  )

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      job_number: "", // filled by the set_job_number trigger
      organisation_id: organisationId,
      location_id: input.locationId,
      customer_id: input.customerId,
      van_id: input.vanId,
      billing_type: input.billingType,
      priority: input.priority,
      job_type: input.jobType,
      description: input.description?.trim() || null,
      quoted_hours: input.quotedHours,
      assigned_tech_id: input.assignedTechId || null,
      bay_id: input.bayId || null,
      job_start_date: input.jobStartDate,
      expected_finish_date: toDateString(expected),
      booking_date: input.bookingDate,
      customer_promised_date: input.customerPromisedDate || null,
      insurance_claim_number:
        input.billingType === "Insurance"
          ? input.insuranceClaimNumber?.trim() || null
          : null,
      warranty_reference:
        input.billingType === "Warranty"
          ? input.warrantyReference?.trim() || null
          : null,
    })
    .select("id")
    .single()

  if (error) return { error: error.message }
  return { id: data.id }
}

export type UpdateJobInput = {
  billing_type?: Enums<"billing_type">
  priority?: Enums<"priority_level">
  job_type?: Enums<"job_type">
  description?: string | null
  quoted_hours?: number
  assigned_tech_id?: string | null
  bay_id?: string | null
  job_start_date?: string | null
  customer_promised_date?: string | null
  insurance_claim_number?: string | null
  warranty_reference?: string | null
  internal_notes?: string | null
}

export async function updateJob(
  jobId: string,
  patch: UpdateJobInput
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from("jobs").update(patch).eq("id", jobId)
  if (error) return { error: error.message }
  return {}
}

export async function changeJobStatus(
  jobId: string,
  status: Enums<"job_status">,
  reason?: string,
  holdReason?: string | null
): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: current } = await supabase
    .from("jobs")
    .select("status")
    .eq("id", jobId)
    .single()
  if (current?.status === status) return {}

  // hold_reason only applies while On Hold; clear it on any other status.
  const { error } = await supabase
    .from("jobs")
    .update({
      status,
      hold_reason: status === "On Hold" ? holdReason?.trim() || null : null,
    })
    .eq("id", jobId)
  if (error) return { error: error.message }

  if (reason?.trim()) {
    const { data: latest } = await supabase
      .from("job_status_log")
      .select("id")
      .eq("job_id", jobId)
      .order("changed_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (latest) {
      await supabase
        .from("job_status_log")
        .update({ reason: reason.trim() })
        .eq("id", latest.id)
    }
  }
  return {}
}

export async function changePromiseDate(
  jobId: string,
  newDate: string,
  reason: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("jobs")
    .update({ expected_finish_date: newDate })
    .eq("id", jobId)
  if (error) return { error: error.message }

  const { data: latest } = await supabase
    .from("promise_date_log")
    .select("id")
    .eq("job_id", jobId)
    .order("changed_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latest && reason.trim()) {
    await supabase
      .from("promise_date_log")
      .update({ reason: reason.trim() })
      .eq("id", latest.id)
  }
  return {}
}

export async function deleteJob(jobId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from("jobs").delete().eq("id", jobId)
  if (error) return { error: error.message }
  return {}
}
