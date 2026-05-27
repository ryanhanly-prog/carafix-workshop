"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
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
import { formatDate, surname } from "@/lib/format"

export type QuoteRow = {
  id: string
  quote_number: string | null
  status: string
  total: number | null
  created_at: string | null
  description: string | null
  customers: { name: string } | null
  vans: { make: string | null; model: string | null; rego: string | null } | null
  job_type_canonical: { name: string } | null
  insurers: { name: string } | null
}

const ALL = "all"
const STATUSES = ["draft", "sent", "approved", "rejected", "converted_to_job", "cancelled"]

function money(n: number | null) {
  if (n == null) return "—"
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n)
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "approved"
      ? "default"
      : status === "rejected" || status === "cancelled"
        ? "destructive"
        : "secondary"
  return <Badge variant={variant}>{status.replace(/_/g, " ")}</Badge>
}

function vanLabel(v: QuoteRow["vans"]) {
  if (!v) return "—"
  return [v.make, v.model].filter(Boolean).join(" ") || v.rego || "—"
}

export function QuotesView({
  quotes,
  jobTypes,
  insurers,
}: {
  quotes: QuoteRow[]
  jobTypes: { id: string; name: string }[]
  insurers: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [status, setStatus] = React.useState(ALL)
  const [jobType, setJobType] = React.useState(ALL)
  const [insurer, setInsurer] = React.useState(ALL)
  const [search, setSearch] = React.useState("")

  const filtered = quotes.filter((q) => {
    if (status !== ALL && q.status !== status) return false
    if (jobType !== ALL && q.job_type_canonical?.name !== jobType) return false
    if (insurer !== ALL && q.insurers?.name !== insurer) return false
    const term = search.trim().toLowerCase()
    if (term) {
      const hay = [q.quote_number, q.customers?.name, q.description].filter(Boolean).join(" ").toLowerCase()
      if (!hay.includes(term)) return false
    }
    return true
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Quotes</h1>
        <Button asChild>
          <Link href="/quotes/new">
            <Plus className="size-4" />
            New quote
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search quote #, customer, description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={jobType} onValueChange={setJobType}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Job type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All job types</SelectItem>
            {jobTypes.map((t) => (
              <SelectItem key={t.id} value={t.name}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={insurer} onValueChange={setInsurer}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Insurer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All insurers</SelectItem>
            {insurers.map((i) => (
              <SelectItem key={i.id} value={i.name}>
                {i.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quote #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Job type</TableHead>
                <TableHead>Insurer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                    {quotes.length === 0
                      ? "No quotes yet — create one."
                      : "No quotes match these filters."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((q) => (
                  <TableRow
                    key={q.id}
                    className="cursor-pointer"
                    onClick={() =>
                      router.push(q.status === "draft" ? `/quotes/${q.id}/edit` : `/quotes/${q.id}`)
                    }
                  >
                    <TableCell className="font-medium">{q.quote_number ?? "—"}</TableCell>
                    <TableCell>{surname(q.customers?.name) || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{vanLabel(q.vans)}</TableCell>
                    <TableCell>{q.job_type_canonical?.name ?? "—"}</TableCell>
                    <TableCell>{q.insurers?.name ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={q.status} />
                    </TableCell>
                    <TableCell className="text-right">{money(q.total)}</TableCell>
                    <TableCell>{formatDate(q.created_at)}</TableCell>
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
