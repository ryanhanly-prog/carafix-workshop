"use client"

import * as React from "react"
import { Loader2, UploadCloud } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { importMechanicDeskZip } from "@/app/actions/import"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type ImportBatch = {
  id: string
  status: string
  files_uploaded: string[] | null
  rows_inserted: number | null
  rows_updated: number | null
  rows_failed: number | null
  uploaded_at: string | null
  completed_at: string | null
  error_message: string | null
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "completed"
      ? "default"
      : status === "failed"
        ? "destructive"
        : "secondary"
  return <Badge variant={variant}>{status}</Badge>
}

function formatWhen(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function ImportView({ batches }: { batches: ImportBatch[] }) {
  const router = useRouter()
  const [files, setFiles] = React.useState<File[]>([])
  const [dragOver, setDragOver] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const inputRef = React.useRef<HTMLInputElement>(null)

  function addFiles(list: FileList | null) {
    if (!list) return
    const zips = Array.from(list).filter((f) =>
      f.name.toLowerCase().endsWith(".zip")
    )
    if (zips.length === 0) {
      toast.error("Only Mechanic Desk .zip exports are supported.")
      return
    }
    setFiles((prev) => [...prev, ...zips])
  }

  function submit() {
    if (files.length === 0) return
    const formData = new FormData()
    for (const f of files) formData.append("files", f)
    startTransition(async () => {
      const res = await importMechanicDeskZip(formData)
      if (res.ok) {
        toast.success("Import complete", {
          description: `${res.totals?.inserted ?? 0} inserted, ${res.totals?.updated ?? 0} updated, ${res.totals?.failed ?? 0} skipped.`,
        })
        setFiles([])
        router.refresh()
      } else {
        toast.error("Import failed", { description: res.message })
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Imports</h1>
        <p className="text-sm text-muted-foreground">
          Upload Mechanic Desk export ZIPs (Customers, Stocks, Invoices, Quotes).
          Re-importing the same export updates existing records rather than
          duplicating them.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              addFiles(e.dataTransfer.files)
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors",
              dragOver
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50"
            )}
          >
            <UploadCloud className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              Drag &amp; drop export ZIPs here, or click to browse
            </p>
            <p className="text-xs text-muted-foreground">
              You can add several ZIPs at once (Stocks, Customers, Invoices, Quotes).
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".zip"
              multiple
              hidden
              onChange={(e) => addFiles(e.target.files)}
            />
          </div>

          {files.length > 0 && (
            <div className="space-y-2">
              <ul className="space-y-1 text-sm">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center justify-between rounded-md bg-muted px-3 py-2"
                  >
                    <span className="truncate">{f.name}</span>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        setFiles((prev) => prev.filter((_, idx) => idx !== i))
                      }
                      disabled={pending}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-2">
                <Button onClick={submit} disabled={pending}>
                  {pending && <Loader2 className="size-4 animate-spin" />}
                  {pending ? "Importing…" : `Import ${files.length} file(s)`}
                </Button>
                {!pending && (
                  <Button variant="ghost" onClick={() => setFiles([])}>
                    Clear
                  </Button>
                )}
              </div>
              {pending && (
                <p className="text-xs text-muted-foreground">
                  Processing — this can take a minute for large exports. Don&apos;t
                  close this tab.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Files</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Inserted</TableHead>
                <TableHead className="text-right">Updated</TableHead>
                <TableHead className="text-right">Skipped</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-muted-foreground"
                  >
                    No imports yet.
                  </TableCell>
                </TableRow>
              ) : (
                batches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>{formatWhen(b.uploaded_at)}</TableCell>
                    <TableCell className="max-w-[260px]">
                      <span className="block truncate text-xs text-muted-foreground">
                        {(b.files_uploaded ?? []).join(", ") || "—"}
                      </span>
                      {b.error_message && (
                        <span className="block truncate text-xs text-red-600">
                          {b.error_message}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={b.status} />
                    </TableCell>
                    <TableCell className="text-right">{b.rows_inserted ?? 0}</TableCell>
                    <TableCell className="text-right">{b.rows_updated ?? 0}</TableCell>
                    <TableCell className="text-right">{b.rows_failed ?? 0}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
