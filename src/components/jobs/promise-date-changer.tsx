"use client"

import * as React from "react"
import { parseISO } from "date-fns"
import { CalendarClock, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
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
import { Textarea } from "@/components/ui/textarea"
import { changePromiseDate } from "@/lib/actions/jobs"
import { toDateString } from "@/lib/work-days"

export function PromiseDateChanger({
  jobId,
  current,
}: {
  jobId: string
  current: string | null
}) {
  const [open, setOpen] = React.useState(false)
  const [date, setDate] = React.useState<Date | undefined>(
    current ? parseISO(current) : undefined
  )
  const [reason, setReason] = React.useState("")
  const [pending, startTransition] = React.useTransition()
  const queryClient = useQueryClient()

  function save() {
    if (!date) {
      toast.error("Pick a date")
      return
    }
    if (!reason.trim()) {
      toast.error("A reason is required to change the promise date")
      return
    }
    startTransition(async () => {
      const res = await changePromiseDate(jobId, toDateString(date), reason)
      if (res.error) {
        toast.error("Could not change date", { description: res.error })
        return
      }
      toast.success("Promise date updated")
      queryClient.invalidateQueries({ queryKey: ["job", jobId] })
      queryClient.invalidateQueries({ queryKey: ["jobs"] })
      queryClient.invalidateQueries({ queryKey: ["job-history", jobId] })
      setOpen(false)
      setReason("")
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CalendarClock className="size-4" /> Change date
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Change promise date</DialogTitle>
          <DialogDescription>
            The change and reason are recorded in the job history.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>New expected finish</Label>
            <DatePicker value={date} onChange={setDate} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="promise-reason">Reason</Label>
            <Textarea
              id="promise-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
