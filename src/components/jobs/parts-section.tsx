"use client"

import * as React from "react"
import { Check, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"

import { PartStatusBadge } from "@/components/jobs/badges"
import { PartDialog } from "@/components/jobs/part-dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { deletePart, markPartReceived } from "@/lib/actions/parts"
import { formatDate } from "@/lib/format"
import { useJobParts } from "@/lib/queries"
import type { Part } from "@/lib/types"

function PartRow({ jobId, part }: { jobId: string; part: Part }) {
  const queryClient = useQueryClient()
  const [pending, startTransition] = React.useTransition()

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["job-parts", jobId] })
    queryClient.invalidateQueries({ queryKey: ["job", jobId] })
    queryClient.invalidateQueries({ queryKey: ["jobs"] })
    queryClient.invalidateQueries({ queryKey: ["parts"] })
  }

  function receive() {
    startTransition(async () => {
      const res = await markPartReceived(part.id)
      if (res.error) {
        toast.error("Could not mark received", { description: res.error })
        return
      }
      toast.success("Part received")
      invalidate()
    })
  }

  function remove() {
    startTransition(async () => {
      const res = await deletePart(part.id)
      if (res.error) {
        toast.error("Could not delete part", { description: res.error })
        return
      }
      toast.success("Part deleted")
      invalidate()
    })
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{part.description}</TableCell>
      <TableCell>{part.supplier ?? "—"}</TableCell>
      <TableCell>{part.quantity ?? 1}</TableCell>
      <TableCell>{part.is_critical ? "Yes" : "No"}</TableCell>
      <TableCell>
        <PartStatusBadge status={part.status} />
      </TableCell>
      <TableCell>{formatDate(part.eta_date)}</TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          {part.status !== "Received" && part.status !== "Fitted" ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={receive}
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Receive
            </Button>
          ) : null}
          <PartDialog jobId={jobId} part={part} />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Delete part">
                <Trash2 className="size-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this part?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes “{part.description}” from the job.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TableCell>
    </TableRow>
  )
}

export function PartsSection({ jobId }: { jobId: string }) {
  const { data: parts, isLoading } = useJobParts(jobId)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Parts</h2>
        <PartDialog jobId={jobId} />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Critical</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>ETA</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ) : !parts || parts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-muted-foreground"
                >
                  No parts on this job yet.
                </TableCell>
              </TableRow>
            ) : (
              parts.map((p) => <PartRow key={p.id} jobId={jobId} part={p} />)
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
