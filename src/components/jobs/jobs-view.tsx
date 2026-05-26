"use client"

import * as React from "react"
import { AlertTriangle, CheckCircle2 } from "lucide-react"
import { useRouter } from "next/navigation"

import { PriorityBadge, StatusBadge } from "@/components/jobs/badges"
import { NewJobDialog } from "@/components/jobs/new-job-dialog"
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatDate, surname } from "@/lib/format"
import { JOB_CATEGORIES, JOB_STATUSES } from "@/lib/job-display"
import { useLocation } from "@/lib/location-context"
import { useJobs, useTechnicians } from "@/lib/queries"

const ALL = "all"

export function JobsView() {
  const { currentLocationId } = useLocation()
  const router = useRouter()
  const { data: jobs, isLoading } = useJobs(currentLocationId)
  const { data: techs = [] } = useTechnicians(currentLocationId)

  const [status, setStatus] = React.useState<string>(ALL)
  const [techId, setTechId] = React.useState<string>(ALL)
  const [category, setCategory] = React.useState<string>(ALL)
  const [search, setSearch] = React.useState("")

  const filtered = React.useMemo(() => {
    if (!jobs) return []
    const term = search.trim().toLowerCase()
    return jobs.filter((j) => {
      if (status !== ALL && j.status !== status) return false
      if (techId !== ALL && j.assigned_tech_id !== techId) return false
      if (category !== ALL && j.category !== category) return false
      if (term) {
        const haystack = [
          j.job_number,
          j.customers?.name,
          j.vans?.rego,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        if (!haystack.includes(term)) return false
      }
      return true
    })
  }, [jobs, status, techId, category, search])

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
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {JOB_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Van</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Tech</TableHead>
                <TableHead>Planned start</TableHead>
                <TableHead>Expected finish</TableHead>
                <TableHead className="text-right">Flags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={10}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10}>
                    <div className="flex flex-col items-center gap-3 py-12 text-center">
                      <p className="text-muted-foreground">
                        {jobs && jobs.length === 0
                          ? "No jobs at this location yet — create one."
                          : "No jobs match these filters."}
                      </p>
                      {jobs &&
                      jobs.length === 0 &&
                      currentLocationId ? (
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
                    <TableCell>{j.category}</TableCell>
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
                    <TableCell>{formatDate(j.planned_start_date)}</TableCell>
                    <TableCell>{formatDate(j.expected_finish_date)}</TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center justify-end gap-1.5">
                        {j.is_delayed ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <AlertTriangle className="size-4 text-red-600" />
                            </TooltipTrigger>
                            <TooltipContent>Delayed</TooltipContent>
                          </Tooltip>
                        ) : null}
                        {j.is_pickup_ready ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <CheckCircle2 className="size-4 animate-pulse text-green-600" />
                            </TooltipTrigger>
                            <TooltipContent>Ready for pickup</TooltipContent>
                          </Tooltip>
                        ) : null}
                      </span>
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
