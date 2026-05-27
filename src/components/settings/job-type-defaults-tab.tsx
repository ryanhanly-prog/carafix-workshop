"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { updateJobTypeDefault } from "@/lib/actions/job-types"

export type JobTypeDefaultRow = {
  default_id: string
  canonical_name: string
  labour_rate_source: string
  workshop_retail_rate: number | null
  markup_floor_pct: number | null
  markup_default_pct: number | null
  notes: string | null
}

const SOURCES = ["insurer_capped", "workshop_retail", "jayco_published", "cost_only"]

function DefaultRow({ row, onSaved }: { row: JobTypeDefaultRow; onSaved: () => void }) {
  const [source, setSource] = React.useState(row.labour_rate_source)
  const [rate, setRate] = React.useState(row.workshop_retail_rate?.toString() ?? "")
  const [floor, setFloor] = React.useState(row.markup_floor_pct?.toString() ?? "0")
  const [def, setDef] = React.useState(row.markup_default_pct?.toString() ?? "0")
  const [notes, setNotes] = React.useState(row.notes ?? "")
  const [pending, startTransition] = React.useTransition()

  function save() {
    startTransition(async () => {
      const res = await updateJobTypeDefault(row.default_id, {
        labour_rate_source: source,
        workshop_retail_rate: rate === "" ? null : Number(rate),
        markup_floor_pct: floor === "" ? 0 : Number(floor),
        markup_default_pct: def === "" ? 0 : Number(def),
        notes,
      })
      if (res.error) {
        toast.error("Save failed", { description: res.error })
        return
      }
      toast.success(`${row.canonical_name} updated`)
      onSaved()
    })
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{row.canonical_name}</TableCell>
      <TableCell>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SOURCES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input
          className="h-8 w-24 text-right"
          inputMode="decimal"
          value={rate}
          disabled={source !== "workshop_retail"}
          onChange={(e) => setRate(e.target.value)}
        />
      </TableCell>
      <TableCell>
        <Input className="h-8 w-16 text-right" inputMode="decimal" value={floor} onChange={(e) => setFloor(e.target.value)} />
      </TableCell>
      <TableCell>
        <Input className="h-8 w-16 text-right" inputMode="decimal" value={def} onChange={(e) => setDef(e.target.value)} />
      </TableCell>
      <TableCell>
        <Input className="h-8 min-w-[160px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </TableCell>
      <TableCell>
        <Button size="sm" variant="outline" onClick={save} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Save
        </Button>
      </TableCell>
    </TableRow>
  )
}

export function JobTypeDefaultsTab({ rows }: { rows: JobTypeDefaultRow[] }) {
  const router = useRouter()
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        How labour is rated and parts are marked up per job type. Changes are logged
        to the audit log.
      </p>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job type</TableHead>
                <TableHead>Labour rate source</TableHead>
                <TableHead className="text-right">Workshop rate</TableHead>
                <TableHead className="text-right">Markup floor %</TableHead>
                <TableHead className="text-right">Markup default %</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <DefaultRow key={r.default_id} row={r} onSaved={() => router.refresh()} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
