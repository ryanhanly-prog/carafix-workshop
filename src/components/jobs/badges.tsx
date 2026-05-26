import { AlertTriangle, CheckCircle2, Clock } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  partStatusBadgeClass,
  priorityBadgeClass,
  statusBadgeClass,
  type JobStatus,
  type PartStatus,
  type Priority,
} from "@/lib/job-display"

export function StatusBadge({
  status,
  className,
}: {
  status: JobStatus
  className?: string
}) {
  return (
    <Badge variant="outline" className={cn(statusBadgeClass[status], className)}>
      {status}
    </Badge>
  )
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <Badge variant="outline" className={priorityBadgeClass[priority]}>
      {priority}
    </Badge>
  )
}

export function PartStatusBadge({ status }: { status: PartStatus }) {
  return (
    <Badge variant="outline" className={partStatusBadgeClass[status]}>
      {status}
    </Badge>
  )
}

/** Compact flag icons for job-list rows: delayed, urgent, pickup-ready. */
export function JobFlagIcons({
  isDelayed,
  isUrgent,
  isPickupReady,
}: {
  isDelayed?: boolean
  isUrgent?: boolean
  isPickupReady?: boolean
}) {
  if (!isDelayed && !isUrgent && !isPickupReady) return null
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      {isDelayed ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <AlertTriangle className="size-4 text-red-600" />
          </TooltipTrigger>
          <TooltipContent>Delayed</TooltipContent>
        </Tooltip>
      ) : null}
      {isUrgent ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Clock className="size-4 animate-pulse text-red-600" />
          </TooltipTrigger>
          <TooltipContent>Customer collecting soon</TooltipContent>
        </Tooltip>
      ) : null}
      {isPickupReady ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <CheckCircle2 className="size-4 text-green-600" />
          </TooltipTrigger>
          <TooltipContent>Ready for pickup</TooltipContent>
        </Tooltip>
      ) : null}
    </span>
  )
}
