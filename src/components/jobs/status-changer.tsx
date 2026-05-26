"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"

import { StatusBadge } from "@/components/jobs/badges"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { changeJobStatus } from "@/lib/actions/jobs"
import { JOB_STATUSES, type JobStatus } from "@/lib/job-display"

export function StatusChanger({
  jobId,
  current,
}: {
  jobId: string
  current: JobStatus
}) {
  const [open, setOpen] = React.useState(false)
  const [status, setStatus] = React.useState<JobStatus>(current)
  const [reason, setReason] = React.useState("")
  const [pending, startTransition] = React.useTransition()
  const queryClient = useQueryClient()

  function save() {
    startTransition(async () => {
      // Optimistic update of the cached job.
      const key = ["job", jobId]
      const previous = queryClient.getQueryData(key)
      queryClient.setQueryData(key, (old: unknown) =>
        old ? { ...(old as object), status } : old
      )

      const res = await changeJobStatus(jobId, status, reason)
      if (res.error) {
        queryClient.setQueryData(key, previous)
        toast.error("Could not change status", { description: res.error })
        return
      }
      toast.success("Status updated")
      queryClient.invalidateQueries({ queryKey: ["job", jobId] })
      queryClient.invalidateQueries({ queryKey: ["jobs"] })
      queryClient.invalidateQueries({ queryKey: ["job-history", jobId] })
      setOpen(false)
      setReason("")
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setStatus(current)
      }}
    >
      <DialogTrigger asChild>
        <button type="button" className="cursor-pointer" aria-label="Change status">
          <StatusBadge status={current} />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Change status</DialogTitle>
          <DialogDescription>
            Optionally record a reason; it is saved to the job history.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={status} onValueChange={(v) => setStatus(v as JobStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {JOB_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="space-y-1">
            <Label htmlFor="status-reason">Reason (optional)</Label>
            <Textarea
              id="status-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={pending || status === current}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
