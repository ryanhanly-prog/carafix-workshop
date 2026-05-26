"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { X } from "lucide-react"

import { JobFlagIcons, PriorityBadge, StatusBadge } from "@/components/jobs/badges"
import { NewJobDialog } from "@/components/jobs/new-job-dialog"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { formatDate, surname } from "@/lib/format"
import { BILLING_TYPES, JOB_STATUSES } from "@/lib/job-display"
import { useLocation } from "@/lib/location-context"
import { useJobs, useTechnicians } from "@/lib/queries"
import type { JobListRow } from "@/lib/types"

const ALL = "all"
const COLUMN_COUNT = 13

// Quick-filters arriving from dashboard widgets via ?filter=.
const FILTER_LABELS: Record<string, string> = {
  customer_collecting: "Customer collecting",
  in_progress: "In workshop",
  urgent: "Urgent",
  delayed: "Delayed",
  on_hold: "On hold",
}

const IN_WORKSHOP = ["Arrived", "In Progress", "On Hold"]

function matchesQuickFilter(j: JobListRow, filter: string): boolean {
  switch (filter) {
    case "customer_collecting":
      return j.customer_promised_date != null && j.status !== "Picked Up"
    case "in_progress":
      return IN_WORKSHOP.includes(j.status)
    case "urgent":
      return !!j.is_urgent
    case "delayed":
      return !!j.is_delayed
    case "on_hold":
      return j.status === "On Hold"
    default:
      return true
  }
}

export function JobsView() {
  const { currentLocationId } = useLocation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const quickFilter = searchParams.get("filter") ?? ""
  const { data: jobs, isLoading } = useJobs(currentLocationId)
  const { data: techs = [] } = useTechnicians(currentLocationId)

  const [status, setStatus] = React.useState<string>(ALL)
  const [techId, setTechId] = React.useState<string>(ALL)
  const [billingType, setBillingType] = React.useState<string>(ALL)
  const [search, setSearch] = React.useState("")

  const filtered = React.useMemo(() => {
    if (!jobs) return []
    const term = search.trim().toLowerCase()
    const result = jobs.filter((j) => {
      if (quickFilter && !matchesQuickFilter(j, quickFilter)) return false
      if (status !== ALL && j.status !== status) return false
      if (techId !== ALL && j.assigned_tech_id !== techId) return false
      if (billingType !== ALL && j.billing_type !== billingType) return false
      if (term) {
        const haystack = [j.job_number, j.customers?.name, j.vans?.rego]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        if (!haystack.includes(term)) return false
      }
      return true
    })
    // Customer-collecting view surfaces the soonest pickups first.
    if (quickFilter === "customer_collecting") {
      result.sort((a, b) =>
        (a.customer_promised_date ?? "").localeCompare(b.customer_promised_date ?? "")
      )
    }
    return result
  }, [jobs, status, techId, billingType, search, quickFilter])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
        {currentLocationId ? <NewJobDialog locationId={currentLocationId} /> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search job #, customer, rego…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {JOB_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={techId} onValueChange={setTechId}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Technician" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All techs</SelectItem>
            {techs.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={billingType} onValueChange={setBillingType}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Billing type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All billing types</SelectItem>
            {BILLING_TYPES.map((b) => (
              <SelectItem key={b} value={b}>
                {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {quickFilter && FILTER_LABELS[quickFilter] ? (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1.5">
            Filter: {FILTER_LABELS[quickFilter]}
            <button
              type="button"
              onClick={() => router.push("/jobs")}
              className="inline-flex items-center hover:text-foreground"
              aria-label="Clear filter"
            >
              <X className="size-3" />
              clear
            </button>
          </Badge>
        </div>
      ) : null}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Van</TableHead>
                <TableHead>Job type</TableHead>
                <TableHead>Billing type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Tech</TableHead>
                <TableHead>Booking</TableHead>
                <TableHead>Job start</TableHead>
                <TableHead>Customer due</TableHead>
                <TableHead>Expected finish</TableHead>
                <TableHead className="text-right">Flags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={COLUMN_COUNT}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={COLUMN_COUNT}>
                    <div className="flex flex-col items-center gap-3 py-12 text-center">
                      <p className="text-muted-foreground">
                        {jobs && jobs.length === 0
                          ? "No jobs at this location yet — create one."
                          : "No jobs match these filters."}
                      </p>
                      {jobs && jobs.length === 0 && currentLocationId ? (
                        <NewJobDialog locationId={currentLocationId} />
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((j) => (
                  <TableRow
                    key={j.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/jobs/${j.id}`)}
                  >
                    <TableCell className="font-medium">{j.job_number}</TableCell>
                    <TableCell>{surname(j.customers?.name)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {[j.vans?.make, j.vans?.model].filter(Boolean).join(" ") || "—"}
                    </TableCell>
                    <TableCell>{j.job_type ?? "—"}</TableCell>
                    <TableCell>{j.billing_type}</TableCell>
                    <TableCell>
                      <StatusBadge status={j.status} />
                    </TableCell>
                    <TableCell>
                      <PriorityBadge priority={j.priority} />
                    </TableCell>
                    <TableCell>
                      {j.technicians ? (
                        <span className="flex items-center gap-2">
                          <span
                            className="size-2.5 rounded-full"
                            style={{
                              backgroundColor: j.technicians.colour ?? "#94a3b8",
                            }}
                          />
                          {j.technicians.name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(j.booking_date)}</TableCell>
                    <TableCell>{formatDate(j.job_start_date)}</TableCell>
                    <TableCell
                      className={cn(
                        j.is_urgent && "font-semibold text-red-600"
                      )}
                    >
                      {formatDate(j.customer_promised_date)}
                    </TableCell>
                    <TableCell>{formatDate(j.expected_finish_date)}</TableCell>
                    <TableCell className="text-right">
                      <JobFlagIcons
                        isDelayed={j.is_delayed}
                        isUrgent={j.is_urgent}
                        isPickupReady={j.is_pickup_ready}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
