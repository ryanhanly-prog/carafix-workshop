"use client"

import * as React from "react"
import { Check, Loader2 } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"

import { PartStatusBadge } from "@/components/jobs/badges"
import { Card, CardContent } from "@/components/ui/card"
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
import { markPartReceived } from "@/lib/actions/parts"
import { daysOverdue, formatDate } from "@/lib/format"
import { useLocation } from "@/lib/location-context"
import { useParts } from "@/lib/queries"
import type { PartWithJob } from "@/lib/types"

function PartRow({ part }: { part: PartWithJob }) {
  const queryClient = useQueryClient()
  const [pending, startTransition] = React.useTransition()
  const overdue = daysOverdue(part.eta_date)

  function receive() {
    startTransition(async () => {
      const res = await markPartReceived(part.id)
      if (res.error) {
        toast.error("Could not mark received", { description: res.error })
        return
      }
      toast.success("Part received")
      queryClient.invalidateQueries({ queryKey: ["parts"] })
      queryClient.invalidateQueries({ queryKey: ["jobs"] })
    })
  }

  return (
    <TableRow>
      <TableCell className="font-medium">
        {part.jobs ? (
          <Link href={`/jobs/${part.jobs.id}`} className="hover:underline">
            {part.jobs.job_number}
          </Link>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell>{part.jobs?.customers?.name ?? "—"}</TableCell>
      <TableCell>{part.description}</TableCell>
      <TableCell>{part.supplier ?? "—"}</TableCell>
      <TableCell>{formatDate(part.eta_date)}</TableCell>
      <TableCell>
        <PartStatusBadge status={part.status} />
      </TableCell>
      <TableCell>
        {overdue > 0 ? (
          <span className="font-medium text-red-600">{overdue}d</span>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="sm" onClick={receive} disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          Receive
        </Button>
      </TableCell>
    </TableRow>
  )
}

export function PartsView() {
  const { currentLocationId } = useLocation()
  const { data: parts, isLoading } = useParts(currentLocationId)

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Outstanding parts (Needed or Ordered) across all jobs at this location.
        Full editing happens on the job page.
      </p>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Part</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>ETA</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Overdue</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ) : !parts || parts.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-10 text-center text-muted-foreground"
                  >
                    No outstanding parts at this location.
                  </TableCell>
                </TableRow>
              ) : (
                parts.map((p) => <PartRow key={p.id} part={p} />)
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
