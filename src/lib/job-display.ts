import { Constants } from "@/lib/database.types"
import type { Enums } from "@/lib/database.types"

export type JobStatus = Enums<"job_status">
export type Priority = Enums<"priority_level">
export type JobCategory = Enums<"job_category">
export type WorkType = Enums<"work_type">
export type PartStatus = Enums<"part_status">
export type InvoiceStatus = Enums<"invoice_status">
export type TechRole = Enums<"tech_role">

export const JOB_STATUSES = Constants.public.Enums.job_status
export const PRIORITIES = Constants.public.Enums.priority_level
export const JOB_CATEGORIES = Constants.public.Enums.job_category
export const WORK_TYPES = Constants.public.Enums.work_type
export const PART_STATUSES = Constants.public.Enums.part_status
export const INVOICE_STATUSES = Constants.public.Enums.invoice_status
export const TECH_ROLES = Constants.public.Enums.tech_role

/** Tailwind classes per the agreed status colour spec. */
export const statusBadgeClass: Record<JobStatus, string> = {
  "Booked In": "bg-slate-100 text-slate-700 border-slate-200",
  "Waiting to Start": "bg-amber-100 text-amber-800 border-amber-200",
  "In Progress": "bg-blue-100 text-blue-800 border-blue-200",
  "Waiting on Parts": "bg-orange-100 text-orange-800 border-orange-200",
  "QA Check": "bg-purple-100 text-purple-800 border-purple-200",
  "Ready for Pickup": "bg-green-100 text-green-800 border-green-200",
  "Picked Up": "bg-muted text-muted-foreground border-transparent",
}

export const priorityBadgeClass: Record<Priority, string> = {
  Low: "bg-slate-100 text-slate-600 border-slate-200",
  Normal: "bg-slate-100 text-slate-700 border-slate-200",
  High: "bg-amber-100 text-amber-800 border-amber-200",
  Urgent: "bg-red-100 text-red-800 border-red-200",
}

export const partStatusBadgeClass: Record<PartStatus, string> = {
  Needed: "bg-slate-100 text-slate-700 border-slate-200",
  Ordered: "bg-blue-100 text-blue-800 border-blue-200",
  Received: "bg-green-100 text-green-800 border-green-200",
  Fitted: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Cancelled: "bg-muted text-muted-foreground border-transparent",
}
