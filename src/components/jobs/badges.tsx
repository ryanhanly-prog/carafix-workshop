import { Badge } from "@/components/ui/badge"
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
