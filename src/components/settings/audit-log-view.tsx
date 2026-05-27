"use client"

import * as React from "react"

import { Badge } from "@/components/ui/badge"
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

type ChangedFields = {
  before?: Record<string, unknown>
  after?: Record<string, unknown>
}

export type AuditRow = {
  id: string
  entity_type: string
  action: string
  changed_fields: ChangedFields | null
  changed_at: string | null
  changed_by_name: string | null
}

const ALL = "all"
// Fields not worth showing in a change diff.
const NOISE = new Set(["updated_at", "created_at", "id", "organisation_id"])

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "∅"
  if (typeof v === "object") return JSON.stringify(v)
  return String(v)
}

function describeChange(row: AuditRow): React.ReactNode {
  const cf = row.changed_fields
  if (!cf) return <span className="text-muted-foreground">—</span>
  if (row.action === "create") {
    const after = cf.after ?? {}
    const name = (after.name as string) ?? ""
    return <span className="text-muted-foreground">Created {name && `“${name}”`}</span>
  }
  if (row.action === "delete") {
    const before = cf.before ?? {}
    const name = (before.name as string) ?? ""
    return <span className="text-muted-foreground">Deleted {name && `“${name}”`}</span>
  }
  // update / activate / deactivate: show changed keys
  const before = cf.before ?? {}
  const after = cf.after ?? {}
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).filter(
    (k) => !NOISE.has(k) && fmt(before[k]) !== fmt(after[k])
  )
  if (keys.length === 0) return <span className="text-muted-foreground">No field changes</span>
  return (
    <ul className="space-y-0.5">
      {keys.map((k) => (
        <li key={k} className="text-xs">
          <span className="font-medium">{k}</span>:{" "}
          <span className="text-muted-foreground line-through">{fmt(before[k])}</span> →{" "}
          <span>{fmt(after[k])}</span>
        </li>
      ))}
    </ul>
  )
}

function when(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function AuditLogView({ rows }: { rows: AuditRow[] }) {
  const [entityType, setEntityType] = React.useState(ALL)
  const [who, setWho] = React.useState("")
  const [from, setFrom] = React.useState("")
  const [to, setTo] = React.useState("")

  const entityTypes = Array.from(new Set(rows.map((r) => r.entity_type)))

  const filtered = rows.filter((r) => {
    if (entityType !== ALL && r.entity_type !== entityType) return false
    if (who.trim() && !(r.changed_by_name ?? "").toLowerCase().includes(who.trim().toLowerCase()))
      return false
    if (from && r.changed_at && r.changed_at < from) return false
    if (to && r.changed_at && r.changed_at > `${to}T23:59:59`) return false
    return true
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Config changes to insurers and job-type defaults.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={entityType} onValueChange={setEntityType}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Entity type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All entity types</SelectItem>
            {entityTypes.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Changed by…"
          value={who}
          onChange={(e) => setWho(e.target.value)}
          className="w-48"
        />
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Changes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                    No audit entries.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{when(r.changed_at)}</TableCell>
                    <TableCell>{r.changed_by_name ?? "system"}</TableCell>
                    <TableCell>{r.entity_type}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.action}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[420px]">{describeChange(r)}</TableCell>
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
