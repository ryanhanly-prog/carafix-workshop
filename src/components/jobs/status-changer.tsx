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
import { Input } from "@/components/ui/input"
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
import {
  HOLD_REASONS,
  JOB_STATUSES,
  nextStatus,
  type JobStatus,
} from "@/lib/job-display"

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
  const [holdReason, setHoldReason] = React.useState<string>("")
  const [holdOther, setHoldOther] = React.useState("")
  const [pending, startTransition] = React.useTransition()
  const queryClient = useQueryClient()

  const suggested = nextStatus[current]
  const isOnHold = status === "On Hold"
  const resolvedHoldReason =
    holdReason === "Other" ? `Other: ${holdOther.trim()}` : holdReason
  const holdReasonMissing =
    isOnHold && (!holdReason || (holdReason === "Other" && !holdOther.trim()))

  function reset() {
    setStatus(current)
    setReason("")
    setHoldReason("")
    setHoldOther("")
  }

  function save() {
    startTransition(async () => {
      const key = ["job", jobId]
      const previous = queryClient.getQueryData(key)
      queryClient.setQueryData(key, (old: unknown) =>
        old ? { ...(old as object), status } : old
      )

      const res = await changeJobStatus(
        jobId,
        status,
        reason,
        isOnHold ? resolvedHoldReason : null
      )
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
      reset()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) reset()
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
            Statuses are listed in workflow order. Optionally record a reason; it
            is saved to the job history.
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
                  <span className="flex items-center gap-2">
                    {s}
                    {s === suggested ? (
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                        next
                      </span>
                    ) : null}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {isOnHold ? (
            <div className="space-y-2">
              <div className="space-y-1">
                <Label>Hold reason</Label>
                <Select value={holdReason} onValueChange={setHoldReason}>
                  <SelectTrigger>
                    <SelectValue placeholder="Why is it on hold?" />
                  </SelectTrigger>
                  <SelectContent>
                    {HOLD_REASONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {holdReason === "Other" ? (
                <Input
                  placeholder="e.g. customer overseas until 12 June"
                  value={holdOther}
                  onChange={(e) => setHoldOther(e.target.value)}
                />
              ) : null}
            </div>
          ) : null}

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
          <Button
            onClick={save}
            disabled={pending || status === current || holdReasonMissing}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
