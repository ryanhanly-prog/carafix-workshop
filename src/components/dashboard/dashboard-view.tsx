"use client"

import * as React from "react"
import Link from "next/link"
import { addDays } from "date-fns"
import { Clock } from "lucide-react"

import { StatusBadge } from "@/components/jobs/badges"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDate, surname } from "@/lib/format"
import { useJobs, useParts } from "@/lib/queries"
import { useLocation } from "@/lib/location-context"
import type { JobListRow } from "@/lib/types"
import { cn } from "@/lib/utils"
import { toDateString, workingDayProgress } from "@/lib/work-days"

const LIST_LIMIT = 5
const DONE_STATUSES = ["Completed", "QA Check", "Invoiced", "Picked Up"]

function TechDot({ row }: { row: JobListRow }) {
  if (!row.technicians) {
    return <span className="text-xs text-muted-foreground">Unassigned</span>
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: row.technicians.colour ?? "#94a3b8" }}
      />
      {row.technicians.name}
    </span>
  )
}

function JobRow({
  row,
  right,
}: {
  row: JobListRow
  right?: React.ReactNode
}) {
  return (
    <Link
      href={`/jobs/${row.id}`}
      className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted/60"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="font-medium">{row.job_number}</span>
        <span className="truncate text-muted-foreground">
          {surname(row.customers?.name) || "—"}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">{right}</span>
    </Link>
  )
}

function WidgetCard({
  title,
  count,
  children,
  className,
}: {
  title: string
  count?: number
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card size="sm" className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{title}</span>
          {count !== undefined && count > 0 ? (
            <span className="text-xs font-normal text-muted-foreground">
              {count}
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-3 text-sm text-muted-foreground">{children}</p>
}

function ViewAll({ count }: { count: number }) {
  if (count <= LIST_LIMIT) return null
  return (
    <Link
      href="/jobs"
      className="mt-1 block px-2 text-xs text-muted-foreground hover:underline"
    >
      View all {count} →
    </Link>
  )
}

function StatTile({
  label,
  value,
  href,
  emphasis,
}: {
  label: string
  value: number
  href: string
  emphasis?: boolean
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-0.5 rounded-md px-3 py-2 hover:bg-muted/60"
    >
      <span
        className={cn(
          "text-2xl font-semibold tabular-nums",
          emphasis && value > 0 && "text-red-600"
        )}
      >
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </Link>
  )
}

export function DashboardView() {
  const { currentLocationId, currentLocation } = useLocation()
  const { data: jobs, isLoading } = useJobs(currentLocationId)
  const { data: parts = [] } = useParts(currentLocationId)

  const today = toDateString(new Date())
  const tomorrow = toDateString(addDays(new Date(), 1))
  const sevenDays = toDateString(addDays(new Date(), 7))

  const groups = React.useMemo(() => {
    const all = jobs ?? []
    const active = all.filter((j) => j.status !== "Picked Up")
    const inProgress = all.filter((j) => j.status === "In Progress")
    const endingToday = all.filter(
      (j) =>
        j.expected_finish_date === today && !DONE_STATUSES.includes(j.status)
    )
    const readyToStart = all.filter(
      (j) =>
        (j.status === "Booked" || j.status === "Arrived") &&
        j.job_start_date != null &&
        j.job_start_date <= tomorrow
    )
    const collectingSoon = all
      .filter(
        (j) =>
          j.customer_promised_date != null &&
          j.customer_promised_date <= sevenDays &&
          j.status !== "Picked Up"
      )
      .sort((a, b) =>
        (a.customer_promised_date ?? "").localeCompare(
          b.customer_promised_date ?? ""
        )
      )
    const pickedUpNotInvoiced = all.filter(
      (j) => j.picked_up_date === today && j.invoice_status !== "Complete"
    )
    return {
      active,
      inProgress,
      endingToday,
      readyToStart,
      collectingSoon,
      pickedUpNotInvoiced,
      urgent: all.filter((j) => j.is_urgent),
      delayed: all.filter((j) => j.is_delayed),
    }
  }, [jobs, today, tomorrow, sevenDays])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          Today&apos;s snapshot
        </h1>
        {currentLocation ? (
          <span className="text-sm text-muted-foreground">
            {currentLocation.name}
          </span>
        ) : null}
      </div>

      {/* Widget 1 — snapshot strip */}
      <Card size="sm">
        <CardContent className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile label="Active jobs" value={groups.active.length} href="/jobs" />
          <StatTile
            label="In progress"
            value={groups.inProgress.length}
            href="/jobs"
          />
          <StatTile
            label="Urgent"
            value={groups.urgent.length}
            href="/jobs"
            emphasis
          />
          <StatTile
            label="Delayed"
            value={groups.delayed.length}
            href="/jobs"
            emphasis
          />
          <StatTile label="Parts waiting" value={parts.length} href="/parts" />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Widget 2 — in progress today */}
        <WidgetCard title="In progress today" count={groups.inProgress.length}>
          {groups.inProgress.length === 0 ? (
            <EmptyState>
              No jobs in progress. Start the next one from the queue.
            </EmptyState>
          ) : (
            <>
              <div className="space-y-0.5">
                {groups.inProgress.slice(0, LIST_LIMIT).map((j) => {
                  const p = workingDayProgress(
                    j.job_start_date,
                    j.expected_finish_date
                  )
                  return (
                    <JobRow
                      key={j.id}
                      row={j}
                      right={
                        <>
                          <TechDot row={j} />
                          {p ? (
                            <span className="text-xs tabular-nums text-muted-foreground">
                              Day {p.day} of {p.total}
                            </span>
                          ) : null}
                        </>
                      }
                    />
                  )
                })}
              </div>
              <ViewAll count={groups.inProgress.length} />
            </>
          )}
        </WidgetCard>

        {/* Widget 3 — ending today */}
        <WidgetCard title="Ending today" count={groups.endingToday.length}>
          {groups.endingToday.length === 0 ? (
            <EmptyState>Nothing finishing today.</EmptyState>
          ) : (
            <>
              <div className="space-y-0.5">
                {groups.endingToday.slice(0, LIST_LIMIT).map((j) => (
                  <JobRow
                    key={j.id}
                    row={j}
                    right={
                      <>
                        <TechDot row={j} />
                        <StatusBadge status={j.status} />
                      </>
                    }
                  />
                ))}
              </div>
              <ViewAll count={groups.endingToday.length} />
            </>
          )}
        </WidgetCard>

        {/* Widget 4 — ready to start */}
        <WidgetCard title="Ready to start" count={groups.readyToStart.length}>
          {groups.readyToStart.length === 0 ? (
            <EmptyState>Nothing queued for the next 2 days.</EmptyState>
          ) : (
            <>
              <div className="space-y-0.5">
                {groups.readyToStart.slice(0, LIST_LIMIT).map((j) => (
                  <JobRow
                    key={j.id}
                    row={j}
                    right={
                      <>
                        <TechDot row={j} />
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {formatDate(j.job_start_date)}
                        </span>
                      </>
                    }
                  />
                ))}
              </div>
              <ViewAll count={groups.readyToStart.length} />
            </>
          )}
        </WidgetCard>

        {/* Widget 5 — customer collecting soon */}
        <WidgetCard
          title="Customer collecting soon"
          count={groups.collectingSoon.length}
        >
          {groups.collectingSoon.length === 0 ? (
            <EmptyState>No upcoming pickups.</EmptyState>
          ) : (
            <>
              <div className="space-y-0.5">
                {groups.collectingSoon.slice(0, LIST_LIMIT).map((j) => (
                  <JobRow
                    key={j.id}
                    row={j}
                    right={
                      <>
                        {j.is_urgent ? (
                          <Badge className="animate-pulse gap-1 bg-red-600 text-white hover:bg-red-600">
                            <Clock className="size-3" />
                          </Badge>
                        ) : null}
                        <span
                          className={cn(
                            "text-xs tabular-nums text-muted-foreground",
                            j.is_urgent && "font-semibold text-red-600"
                          )}
                        >
                          {formatDate(j.customer_promised_date)}
                        </span>
                      </>
                    }
                  />
                ))}
              </div>
              <ViewAll count={groups.collectingSoon.length} />
            </>
          )}
        </WidgetCard>
      </div>

      {/* Widget 6 — picked up today, not invoiced */}
      <WidgetCard
        title="Picked up today, not invoiced"
        count={groups.pickedUpNotInvoiced.length}
      >
        {groups.pickedUpNotInvoiced.length === 0 ? (
          <EmptyState>All today&apos;s pickups invoiced.</EmptyState>
        ) : (
          <div className="space-y-0.5">
            {groups.pickedUpNotInvoiced.slice(0, LIST_LIMIT).map((j) => (
              <JobRow
                key={j.id}
                row={j}
                right={
                  <span className="text-xs text-muted-foreground">
                    Invoice: {j.invoice_status ?? "—"}
                  </span>
                }
              />
            ))}
          </div>
        )}
      </WidgetCard>
    </div>
  )
}
