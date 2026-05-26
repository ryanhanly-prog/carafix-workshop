"use client"

import { format, parseISO } from "date-fns"
import { ArrowRight, CalendarClock } from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"
import { formatDate } from "@/lib/format"
import { useJobHistory } from "@/lib/queries"

type TimelineEntry = {
  id: string
  at: string
  kind: "status" | "promise"
  text: React.ReactNode
  reason: string | null
}

export function HistorySection({ jobId }: { jobId: string }) {
  const { data, isLoading } = useJobHistory(jobId)

  if (isLoading) {
    return <Skeleton className="h-24 w-full" />
  }

  const entries: TimelineEntry[] = []
  for (const s of data?.status ?? []) {
    entries.push({
      id: `s-${s.id}`,
      at: s.changed_at ?? "",
      kind: "status",
      reason: s.reason,
      text: (
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{s.from_status ?? "—"}</span>
          <ArrowRight className="size-3.5" />
          <span className="font-medium">{s.to_status ?? "—"}</span>
        </span>
      ),
    })
  }
  for (const p of data?.promise ?? []) {
    entries.push({
      id: `p-${p.id}`,
      at: p.changed_at ?? "",
      kind: "promise",
      reason: p.reason,
      text: (
        <span className="flex items-center gap-1.5">
          <CalendarClock className="size-3.5" />
          Promise date {formatDate(p.old_date)} → {formatDate(p.new_date)}
        </span>
      ),
    })
  }
  entries.sort((a, b) => (a.at < b.at ? 1 : -1))

  if (entries.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">No history yet.</p>
    )
  }

  return (
    <ol className="space-y-4">
      {entries.map((e) => (
        <li key={e.id} className="flex gap-3">
          <div className="mt-1.5 size-2 shrink-0 rounded-full bg-border" />
          <div className="space-y-0.5">
            <div className="text-sm">{e.text}</div>
            {e.reason ? (
              <p className="text-sm text-muted-foreground">{e.reason}</p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {e.at ? format(parseISO(e.at), "dd MMM yyyy, h:mm a") : ""}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}
