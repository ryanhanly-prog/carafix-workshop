"use client"

import { useQuery } from "@tanstack/react-query"

import { getBrowserClient } from "@/lib/supabase/browser"
import type {
  Bay,
  CustomerSummary,
  JobDetail,
  JobListRow,
  JobStatusLog,
  Part,
  PartWithJob,
  PromiseDateLog,
  Technician,
  Van,
} from "@/lib/types"

export function useJobs(locationId: string | null) {
  const supabase = getBrowserClient()
  return useQuery({
    queryKey: ["jobs", locationId],
    enabled: !!locationId,
    queryFn: async (): Promise<JobListRow[]> => {
      const [jobsRes, rollupRes] = await Promise.all([
        supabase
          .from("jobs")
          .select(
            "*, customers(name), vans(make, model, rego), technicians(name, colour)"
          )
          .eq("location_id", locationId!)
          .order("job_start_date", { ascending: false, nullsFirst: false }),
        supabase
          .from("v_job_rollup")
          .select("job_id, is_delayed, is_urgent, is_pickup_ready")
          .eq("location_id", locationId!),
      ])
      if (jobsRes.error) throw jobsRes.error
      if (rollupRes.error) throw rollupRes.error
      const flags = new Map(
        (rollupRes.data ?? []).map((r) => [r.job_id, r])
      )
      return (jobsRes.data ?? []).map((j) => ({
        ...j,
        is_delayed: flags.get(j.id)?.is_delayed ?? false,
        is_urgent: flags.get(j.id)?.is_urgent ?? false,
        is_pickup_ready: flags.get(j.id)?.is_pickup_ready ?? false,
      })) as unknown as JobListRow[]
    },
  })
}

export function useJob(jobId: string) {
  const supabase = getBrowserClient()
  return useQuery({
    queryKey: ["job", jobId],
    queryFn: async (): Promise<
      JobDetail & {
        is_delayed: boolean
        is_urgent: boolean
        is_pickup_ready: boolean
      }
    > => {
      const [jobRes, rollupRes] = await Promise.all([
        supabase
          .from("jobs")
          .select(
            "*, customers(*), vans(*), technicians(id, name, colour, role), bays(id, name)"
          )
          .eq("id", jobId)
          .single(),
        supabase
          .from("v_job_rollup")
          .select("is_delayed, is_urgent, is_pickup_ready")
          .eq("job_id", jobId)
          .maybeSingle(),
      ])
      if (jobRes.error) throw jobRes.error
      return {
        ...(jobRes.data as unknown as JobDetail),
        is_delayed: rollupRes.data?.is_delayed ?? false,
        is_urgent: rollupRes.data?.is_urgent ?? false,
        is_pickup_ready: rollupRes.data?.is_pickup_ready ?? false,
      }
    },
  })
}

export function useJobParts(jobId: string) {
  const supabase = getBrowserClient()
  return useQuery({
    queryKey: ["job-parts", jobId],
    queryFn: async (): Promise<Part[]> => {
      const { data, error } = await supabase
        .from("parts")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })
}

export function useJobHistory(jobId: string) {
  const supabase = getBrowserClient()
  return useQuery({
    queryKey: ["job-history", jobId],
    queryFn: async (): Promise<{
      status: JobStatusLog[]
      promise: PromiseDateLog[]
    }> => {
      const [statusRes, promiseRes] = await Promise.all([
        supabase
          .from("job_status_log")
          .select("*")
          .eq("job_id", jobId)
          .order("changed_at", { ascending: false }),
        supabase
          .from("promise_date_log")
          .select("*")
          .eq("job_id", jobId)
          .order("changed_at", { ascending: false }),
      ])
      if (statusRes.error) throw statusRes.error
      if (promiseRes.error) throw promiseRes.error
      return { status: statusRes.data ?? [], promise: promiseRes.data ?? [] }
    },
  })
}

export function useTechnicians(locationId: string | null, activeOnly = false) {
  const supabase = getBrowserClient()
  return useQuery({
    queryKey: ["technicians", locationId, activeOnly],
    enabled: !!locationId,
    queryFn: async (): Promise<Technician[]> => {
      let query = supabase
        .from("technicians")
        .select("*")
        .eq("location_id", locationId!)
        .order("name")
      if (activeOnly) query = query.eq("active", true)
      const { data, error } = await query
      if (error) throw error
      return data ?? []
    },
  })
}

export function useBays(locationId: string | null) {
  const supabase = getBrowserClient()
  return useQuery({
    queryKey: ["bays", locationId],
    enabled: !!locationId,
    queryFn: async (): Promise<Bay[]> => {
      const { data, error } = await supabase
        .from("bays")
        .select("*")
        .eq("location_id", locationId!)
        .eq("active", true)
        .order("name")
      if (error) throw error
      return data ?? []
    },
  })
}

export function useCustomerSearch(term: string) {
  const supabase = getBrowserClient()
  return useQuery({
    queryKey: ["customer-search", term],
    queryFn: async () => {
      let query = supabase.from("customers").select("*").order("name").limit(20)
      if (term.trim()) query = query.ilike("name", `%${term.trim()}%`)
      const { data, error } = await query
      if (error) throw error
      return data ?? []
    },
  })
}

export function useVansByCustomer(customerId: string | null) {
  const supabase = getBrowserClient()
  return useQuery({
    queryKey: ["vans", customerId],
    enabled: !!customerId,
    queryFn: async (): Promise<Van[]> => {
      const { data, error } = await supabase
        .from("vans")
        .select("*")
        .eq("customer_id", customerId!)
        .order("created_at", { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

export function useCustomers() {
  const supabase = getBrowserClient()
  return useQuery({
    queryKey: ["customers"],
    queryFn: async (): Promise<CustomerSummary[]> => {
      const { data, error } = await supabase
        .from("customers")
        .select("*, vans(id), jobs:jobs(id)")
        .order("name")
      if (error) throw error
      return (data ?? []).map((c) => {
        const row = c as unknown as {
          vans: unknown[] | null
          jobs: unknown[] | null
        }
        return {
          ...(c as unknown as CustomerSummary),
          van_count: row.vans?.length ?? 0,
          job_count: row.jobs?.length ?? 0,
        }
      })
    },
  })
}

export function useCustomer(customerId: string) {
  const supabase = getBrowserClient()
  return useQuery({
    queryKey: ["customer", customerId],
    queryFn: async () => {
      const [custRes, vansRes, jobsRes] = await Promise.all([
        supabase.from("customers").select("*").eq("id", customerId).single(),
        supabase.from("vans").select("*").eq("customer_id", customerId).order("created_at"),
        supabase
          .from("jobs")
          .select("id, job_number, status, job_start_date, location_id")
          .eq("customer_id", customerId)
          .order("job_start_date", { ascending: false, nullsFirst: false }),
      ])
      if (custRes.error) throw custRes.error
      if (vansRes.error) throw vansRes.error
      if (jobsRes.error) throw jobsRes.error
      return {
        customer: custRes.data,
        vans: vansRes.data ?? [],
        jobs: jobsRes.data ?? [],
      }
    },
  })
}

export function useParts(locationId: string | null) {
  const supabase = getBrowserClient()
  return useQuery({
    queryKey: ["parts", locationId],
    enabled: !!locationId,
    queryFn: async (): Promise<PartWithJob[]> => {
      const { data, error } = await supabase
        .from("parts")
        .select(
          "*, jobs!inner(id, job_number, status, location_id, customers(name))"
        )
        .in("status", ["Needed", "Ordered"])
        .eq("jobs.location_id", locationId!)
        .order("eta_date", { ascending: true, nullsFirst: false })
      if (error) throw error
      return (data ?? []) as unknown as PartWithJob[]
    },
  })
}
