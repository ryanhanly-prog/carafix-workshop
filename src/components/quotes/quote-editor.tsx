"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { formatDate } from "@/lib/format"
import { getBrowserClient } from "@/lib/supabase/browser"
import { SimilarQuotesPanel } from "@/components/quotes/similar-quotes-panel"
import {
  addLineItem,
  deleteLineItem,
  moveLineItem,
  setQuoteStatus,
  updateLineItem,
  type LineType,
} from "@/lib/actions/quotes"
import { cn } from "@/lib/utils"

export type QuoteHeader = {
  id: string
  organisation_id: string
  quote_number: string | null
  status: string
  canonical_job_type_id: string
  description: string | null
  damage_tags: string[] | null
  subtotal_parts: number | null
  subtotal_labour: number | null
  subtotal_consumables: number | null
  subtotal_other: number | null
  total: number | null
  sent_at: string | null
  customers: { name: string } | null
  vans: { make: string | null; model: string | null; rego: string | null } | null
  job_type_canonical: { id: string; name: string; category: string | null } | null
  insurers: { name: string; capped_labour_rate: number } | null
}

export type LineItem = {
  id: string
  line_order: number
  line_type: LineType
  description: string
  quantity: number | null
  unit: string | null
  unit_cost: number | null
  markup_pct: number | null
  unit_price: number | null
  line_total: number | null
  source: string
  part_id: string | null
}

const STATUSES = ["draft", "sent", "approved", "rejected", "converted_to_job", "cancelled"]
const LINE_TYPES: LineType[] = ["part", "labour", "consumable", "freight", "other"]

const money = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n)

function vanLabel(v: QuoteHeader["vans"]) {
  if (!v) return "—"
  return [v.make, v.model].filter(Boolean).join(" ") + (v.rego ? ` · ${v.rego}` : "")
}

// ----------------------------- editable row -----------------------------
function LineRow({
  line,
  quoteId,
  readOnly,
  onChanged,
}: {
  line: LineItem
  quoteId: string
  readOnly: boolean
  onChanged: () => void
}) {
  const [pending, startTransition] = React.useTransition()
  const [draft, setDraft] = React.useState(line)
  React.useEffect(() => setDraft(line), [line])
  const lineQuoteId = quoteId

  function save(patch: Partial<LineItem>) {
    startTransition(async () => {
      const res = await updateLineItem(line.id, lineQuoteId, {
        description: patch.description,
        quantity: patch.quantity ?? undefined,
        unit: patch.unit,
        unit_cost: patch.unit_cost ?? undefined,
        markup_pct: patch.markup_pct ?? undefined,
        line_type: patch.line_type,
      })
      if (res.error) toast.error("Save failed", { description: res.error })
      onChanged()
    })
  }

  if (readOnly) {
    return (
      <TableRow>
        <TableCell>{line.line_order}</TableCell>
        <TableCell>{line.description}</TableCell>
        <TableCell className="capitalize text-muted-foreground">{line.line_type}</TableCell>
        <TableCell className="text-right">{line.quantity}</TableCell>
        <TableCell>{line.unit ?? "—"}</TableCell>
        <TableCell className="text-right">{money(line.unit_cost)}</TableCell>
        <TableCell className="text-right">{line.markup_pct ?? 0}%</TableCell>
        <TableCell className="text-right">{money(line.unit_price)}</TableCell>
        <TableCell className="text-right font-medium">{money(line.line_total)}</TableCell>
      </TableRow>
    )
  }

  return (
    <TableRow className={cn(pending && "opacity-60")}>
      <TableCell className="text-muted-foreground">{line.line_order}</TableCell>
      <TableCell>
        <Input
          className="h-8 min-w-[200px]"
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          onBlur={() => draft.description !== line.description && save({ description: draft.description })}
        />
      </TableCell>
      <TableCell>
        <Select
          value={draft.line_type}
          onValueChange={(v) => {
            setDraft({ ...draft, line_type: v as LineType })
            save({ line_type: v as LineType })
          }}
        >
          <SelectTrigger className="h-8 w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {LINE_TYPES.map((t) => (
              <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input
          className="h-8 w-16 text-right"
          inputMode="decimal"
          value={draft.quantity ?? ""}
          onChange={(e) => setDraft({ ...draft, quantity: e.target.value === "" ? null : Number(e.target.value) })}
          onBlur={() => (draft.quantity ?? 1) !== (line.quantity ?? 1) && save({ quantity: draft.quantity ?? 1 })}
        />
      </TableCell>
      <TableCell>
        <Input
          className="h-8 w-16"
          value={draft.unit ?? ""}
          onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
          onBlur={() => (draft.unit ?? "") !== (line.unit ?? "") && save({ unit: draft.unit })}
        />
      </TableCell>
      <TableCell>
        <Input
          className="h-8 w-24 text-right"
          inputMode="decimal"
          value={draft.unit_cost ?? ""}
          onChange={(e) => setDraft({ ...draft, unit_cost: e.target.value === "" ? null : Number(e.target.value) })}
          onBlur={() => (draft.unit_cost ?? 0) !== (line.unit_cost ?? 0) && save({ unit_cost: draft.unit_cost ?? 0 })}
        />
      </TableCell>
      <TableCell>
        <Input
          className="h-8 w-16 text-right"
          inputMode="decimal"
          value={draft.markup_pct ?? ""}
          onChange={(e) => setDraft({ ...draft, markup_pct: e.target.value === "" ? null : Number(e.target.value) })}
          onBlur={() => (draft.markup_pct ?? 0) !== (line.markup_pct ?? 0) && save({ markup_pct: draft.markup_pct ?? 0 })}
        />
      </TableCell>
      <TableCell className="text-right text-muted-foreground">{money(line.unit_price)}</TableCell>
      <TableCell className="text-right font-medium">{money(line.line_total)}</TableCell>
      <TableCell>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="size-7" onClick={() => startTransition(async () => { await moveLineItem(line.id, lineQuoteId, "up"); onChanged() })}>
            <ArrowUp className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" onClick={() => startTransition(async () => { await moveLineItem(line.id, lineQuoteId, "down"); onChanged() })}>
            <ArrowDown className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7 text-red-600" onClick={() => startTransition(async () => { await deleteLineItem(line.id, lineQuoteId); onChanged() })}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

export function QuoteEditor({
  quote,
  initialLines,
  markupDefault,
  labourRate,
  readOnly = false,
}: {
  quote: QuoteHeader
  initialLines: LineItem[]
  markupDefault: number
  labourRate: number | null
  readOnly?: boolean
}) {
  const router = useRouter()
  const qc = useQueryClient()
  const supabase = getBrowserClient()

  const { data: header = quote } = useQuery({
    queryKey: ["quote", quote.id],
    initialData: quote,
    queryFn: async () => {
      const { data } = await supabase
        .from("quotes")
        .select(
          "id, organisation_id, quote_number, status, canonical_job_type_id, description, damage_tags, subtotal_parts, subtotal_labour, subtotal_consumables, subtotal_other, total, sent_at, customers(name), vans(make, model, rego), job_type_canonical(id, name, category), insurers(name, capped_labour_rate)"
        )
        .eq("id", quote.id)
        .single()
      return (data as unknown as QuoteHeader) ?? quote
    },
  })

  const { data: lines = initialLines } = useQuery({
    queryKey: ["qli", quote.id],
    initialData: initialLines,
    queryFn: async () => {
      const { data } = await supabase
        .from("quote_line_items")
        .select("id, line_order, line_type, description, quantity, unit, unit_cost, markup_pct, unit_price, line_total, source, part_id")
        .eq("quote_id", quote.id)
        .order("line_order")
      return (data as unknown as LineItem[]) ?? []
    },
  })

  const refresh = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["quote", quote.id] })
    qc.invalidateQueries({ queryKey: ["qli", quote.id] })
  }, [qc, quote.id])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {header.quote_number ?? "Quote"}
            </h1>
            <Badge variant="secondary">{header.status.replace(/_/g, " ")}</Badge>
            {readOnly && <Badge variant="outline">read-only</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {header.customers?.name ?? "No customer"} · {vanLabel(header.vans)} ·{" "}
            {header.job_type_canonical?.name ?? "—"}
            {header.insurers ? ` · ${header.insurers.name} ($${header.insurers.capped_labour_rate}/hr)` : ""}
          </p>
          {header.description && (
            <p className="mt-1 max-w-2xl text-sm">{header.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {readOnly ? (
            <Button variant="outline" asChild>
              <Link href={`/quotes/${quote.id}/edit`}>Edit</Link>
            </Button>
          ) : (
            <Button variant="outline" asChild>
              <Link href={`/quotes/${quote.id}`}>View</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Line items */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Unit cost</TableHead>
                    <TableHead className="text-right">Markup</TableHead>
                    <TableHead className="text-right">Unit price</TableHead>
                    <TableHead className="text-right">Line total</TableHead>
                    {!readOnly && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={readOnly ? 9 : 10} className="py-10 text-center text-muted-foreground">
                        No line items yet. {!readOnly && "Clone a similar quote, or add lines below."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    lines.map((l) => (
                      <LineRow key={l.id} line={l} quoteId={quote.id} readOnly={readOnly} onChanged={refresh} />
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {!readOnly && (
            <AddLineItem
              quoteId={quote.id}
              markupDefault={markupDefault}
              labourRate={labourRate}
              onAdded={refresh}
            />
          )}
        </div>

        {/* Right column: similar quotes + totals */}
        <div className="space-y-4">
          <TotalsCard header={header} readOnly={readOnly} onChanged={refresh} routerRefresh={() => router.refresh()} />
          {!readOnly && <SimilarQuotesPanel quote={header} onCloned={refresh} />}
        </div>
      </div>
    </div>
  )
}

// ----------------------------- totals + status -----------------------------
function TotalsCard({
  header,
  readOnly,
  onChanged,
  routerRefresh,
}: {
  header: QuoteHeader
  readOnly: boolean
  onChanged: () => void
  routerRefresh: () => void
}) {
  const [pending, startTransition] = React.useTransition()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Totals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <Row label="Parts" value={money(header.subtotal_parts)} />
        <Row label="Labour" value={money(header.subtotal_labour)} />
        <Row label="Consumables" value={money(header.subtotal_consumables)} />
        <Row label="Other / freight" value={money(header.subtotal_other)} />
        <div className="my-2 border-t" />
        <Row label="Total" value={money(header.total)} bold />
        {!readOnly && (
          <div className="space-y-1 pt-3">
            <Label className="text-xs">Status</Label>
            <Select
              value={header.status}
              onValueChange={(v) =>
                startTransition(async () => {
                  const res = await setQuoteStatus(header.id, v)
                  if (res.error) toast.error("Status change failed", { description: res.error })
                  else toast.success(`Status → ${v.replace(/_/g, " ")}`)
                  onChanged()
                  routerRefresh()
                })
              }
              disabled={pending}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {header.sent_at && (
              <p className="text-xs text-muted-foreground">Sent {formatDate(header.sent_at)}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn("text-muted-foreground", bold && "font-medium text-foreground")}>{label}</span>
      <span className={cn("tabular-nums", bold && "font-semibold")}>{value}</span>
    </div>
  )
}

// ----------------------------- add line item -----------------------------
function AddLineItem({
  quoteId,
  markupDefault,
  labourRate,
  onAdded,
}: {
  quoteId: string
  markupDefault: number
  labourRate: number | null
  onAdded: () => void
}) {
  const [lineType, setLineType] = React.useState<LineType>("part")
  const [description, setDescription] = React.useState("")
  const [sku, setSku] = React.useState("")
  const [quantity, setQuantity] = React.useState("1")
  const [unit, setUnit] = React.useState("")
  const [unitCost, setUnitCost] = React.useState("")
  const [markup, setMarkup] = React.useState(String(markupDefault))
  const [pending, startTransition] = React.useTransition()

  // Default unit cost to the labour rate when switching to a labour line.
  React.useEffect(() => {
    if (lineType === "labour" && labourRate != null) {
      setUnitCost(String(labourRate))
      setUnit("hr")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineType])

  function add() {
    if (!description.trim()) {
      toast.error("Description is required")
      return
    }
    startTransition(async () => {
      const res = await addLineItem(quoteId, {
        line_type: lineType,
        description: description.trim(),
        quantity: quantity === "" ? 1 : Number(quantity),
        unit: unit || null,
        unit_cost: unitCost === "" ? 0 : Number(unitCost),
        markup_pct: markup === "" ? 0 : Number(markup),
        sku: lineType === "part" ? sku.trim() || null : null,
      })
      if (res.error) {
        toast.error("Could not add line", { description: res.error })
        return
      }
      toast.success("Line added")
      setDescription("")
      setSku("")
      setQuantity("1")
      setUnitCost(lineType === "labour" && labourRate != null ? String(labourRate) : "")
      setMarkup(String(markupDefault))
      onAdded()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add line item</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <Select value={lineType} onValueChange={(v) => setLineType(v as LineType)}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LINE_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        {lineType === "part" && (
          <div className="space-y-1">
            <Label className="text-xs">SKU (captured to parts master if new)</Label>
            <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g. OU-AL-1200x600" />
          </div>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Qty</Label>
            <Input className="w-20" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Unit</Label>
            <Input className="w-20" value={unit} onChange={(e) => setUnit(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Unit cost</Label>
            <Input className="w-28" inputMode="decimal" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Markup %</Label>
            <Input className="w-20" inputMode="decimal" value={markup} onChange={(e) => setMarkup(e.target.value)} />
          </div>
          <Button onClick={add} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

