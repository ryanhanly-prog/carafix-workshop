"use client"

import Link from "next/link"
import { AlertTriangle, ArrowLeft, CheckCircle2 } from "lucide-react"

import { DeleteJobButton } from "@/components/jobs/delete-job-button"
import { EditJobDialog } from "@/components/jobs/edit-job-dialog"
import { HistorySection } from "@/components/jobs/history-section"
import { PartsSection } from "@/components/jobs/parts-section"
import { PriorityBadge } from "@/components/jobs/badges"
import { PromiseDateChanger } from "@/components/jobs/promise-date-changer"
import { StatusChanger } from "@/components/jobs/status-changer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatDate } from "@/lib/format"
import { useJob } from "@/lib/queries"

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

export function JobDetailView({ jobId }: { jobId: string }) {
  const { data: job, isLoading, isError } = useJob(jobId)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (isError || !job) {
    return (
      <div className="space-y-3">
        <p className="text-muted-foreground">Job not found.</p>
        <Button asChild variant="outline">
          <Link href="/jobs">
            <ArrowLeft className="size-4" /> Back to jobs
          </Link>
        </Button>
      </div>
    )
  }

  const van = [job.vans?.make, job.vans?.model].filter(Boolean).join(" ")

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/jobs">
            <ArrowLeft className="size-4" /> Jobs
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                {job.job_number}
              </h1>
              <StatusChanger jobId={job.id} current={job.status} />
            </div>
            <p className="text-muted-foreground">
              {job.customers?.name}
              {van ? ` · ${van}` : ""}
              {job.vans?.rego ? ` · ${job.vans.rego}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <EditJobDialog job={job} />
            <DeleteJobButton jobId={job.id} jobNumber={job.job_number} />
          </div>
        </div>

        {job.is_delayed || job.is_pickup_ready ? (
          <div className="mt-3 flex gap-2">
            {job.is_delayed ? (
              <Badge className="gap-1 bg-red-600 text-white hover:bg-red-600">
                <AlertTriangle className="size-3.5" /> DELAYED
              </Badge>
            ) : null}
            {job.is_pickup_ready ? (
              <Badge className="animate-pulse gap-1 bg-green-600 text-white hover:bg-green-600">
                <CheckCircle2 className="size-3.5" /> READY FOR PICKUP
              </Badge>
            ) : null}
          </div>
        ) : null}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="parts">Parts</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardContent className="space-y-6 pt-6">
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Field label="Category">{job.category}</Field>
                <Field label="Work type">{job.work_type ?? "—"}</Field>
                <Field label="Priority">
                  <PriorityBadge priority={job.priority} />
                </Field>
                <Field label="Technician">
                  {job.technicians?.name ?? "Unassigned"}
                </Field>
                <Field label="Bay">{job.bays?.name ?? "—"}</Field>
                <Field label="Quoted hours">{job.quoted_hours ?? "—"}</Field>
                <Field label="Planned start">
                  {formatDate(job.planned_start_date)}
                </Field>
                <Field label="Booked in">
                  {formatDate(job.booked_in_date)}
                </Field>
                <Field label="Invoice status">
                  {job.invoice_status ?? "—"}
                </Field>
                {job.category === "Insurance" ? (
                  <Field label="Insurance claim #">
                    {job.insurance_claim_number ?? "—"}
                  </Field>
                ) : null}
                {job.category === "Warranty" ? (
                  <Field label="Chassis number or rego">
                    {job.warranty_reference ?? "—"}
                  </Field>
                ) : null}
              </dl>

              <div className="flex items-end justify-between gap-4 rounded-md border p-3">
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">
                    Expected finish (promise date)
                  </p>
                  <p className="text-sm font-medium">
                    {formatDate(job.expected_finish_date)}
                  </p>
                </div>
                <PromiseDateChanger
                  jobId={job.id}
                  current={job.expected_finish_date}
                />
              </div>

              {job.description ? (
                <Field label="Description">
                  <p className="whitespace-pre-wrap">{job.description}</p>
                </Field>
              ) : null}
              {job.internal_notes ? (
                <Field label="Internal notes">
                  <p className="whitespace-pre-wrap">{job.internal_notes}</p>
                </Field>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="parts" className="mt-4">
          <PartsSection jobId={job.id} />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <HistorySection jobId={job.id} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
