import type { Tables } from "@/lib/database.types"

export type Job = Tables<"jobs">
export type Customer = Tables<"customers">
export type Van = Tables<"vans">
export type Technician = Tables<"technicians">
export type Part = Tables<"parts">
export type Bay = Tables<"bays">
export type JobStatusLog = Tables<"job_status_log">
export type PromiseDateLog = Tables<"promise_date_log">

/** A jobs-list row: the job plus embedded labels and the rollup flags. */
export type JobListRow = Job & {
  customers: Pick<Customer, "name"> | null
  vans: Pick<Van, "make" | "model" | "rego"> | null
  technicians: Pick<Technician, "name" | "colour"> | null
  is_delayed: boolean
  is_urgent: boolean
  is_pickup_ready: boolean
}

/** A full job for the detail page, with related records embedded. */
export type JobDetail = Job & {
  customers: Customer | null
  vans: Van | null
  technicians: Pick<Technician, "id" | "name" | "colour" | "role"> | null
  bays: Pick<Bay, "id" | "name"> | null
}

/** A part on the workshop-wide parts view, with its parent job's labels. */
export type PartWithJob = Part & {
  jobs: {
    id: string
    job_number: string
    status: Job["status"]
    customers: Pick<Customer, "name"> | null
  } | null
}

export type CustomerSummary = Customer & {
  van_count: number
  job_count: number
}
