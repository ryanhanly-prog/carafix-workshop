"use client"

import * as React from "react"
import { Loader2, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"

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
import { deleteJob } from "@/lib/actions/jobs"

export function DeleteJobButton({
  jobId,
  jobNumber,
}: {
  jobId: string
  jobNumber: string
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [pending, startTransition] = React.useTransition()

  function remove() {
    startTransition(async () => {
      const res = await deleteJob(jobId)
      if (res.error) {
        toast.error("Could not delete job", { description: res.error })
        return
      }
      toast.success("Job deleted")
      queryClient.invalidateQueries({ queryKey: ["jobs"] })
      router.push("/jobs")
    })
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Trash2 className="size-4" /> Delete job
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete job {jobNumber}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the job and its parts, tasks and history.
            This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={remove} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
