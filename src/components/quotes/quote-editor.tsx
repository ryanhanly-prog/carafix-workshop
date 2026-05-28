"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, ExternalLink, Loader2, Plus, Trash2 } from "lucide-react"
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDate, formatMoney } from "@/lib/format"
import { getBrowserClient } from "@/lib/supabase/browser"
import { SimilarQuotesPanel, useSimilarQuotes } from "@/components/quotes/similar-quotes-panel"
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

function vanLabel(v: QuoteHeader["vans"]) {
  if (!v) return "—"
  return [v.make, v.model].filter(Boolean).join(" ") + (v.rego ? ` · ${v.rego}` : "")
}

// Display-only unit fallback by line type (never written to the DB).
function defaultUnit(lineType: LineType): string {
  if (lineType === "labour") return "hr"
  if (lineType === "part" || lineType === "consumable" || lineType === "freight") return "each"
  return ""
}

// A cloned section header surfaces as an 'other' line with everything zeroed.
function isSectionDivider(l: LineItem): boolean {
  return (
    l.line_type === "other" &&
    (l.quantity ?? 0) === 0 &&
    (l.unit_cost ?? 0) === 0 &&
    (l.line_total ?? 0) === 0
  )
}

// ----------------------------- editable row -----------------------------
function LineRow({
  line,
  quoteId,
  readOnly,
  onChanged,
  autoFocus = false,
  onAutoFocused,
}: {
  line: LineItem
  quoteId: string
  readOnly: boolean
  onChanged: () => void
  /** True when this row was just created via "Add section heading" and
   * should drop straight into edit mode. Set by QuoteEditor for one render
   * after the post-add refetch lands. */
  autoFocus?: boolean
  /** Called once the autofocus has been consumed so the parent can clear
   * its flag and not refocus on subsequent renders. */
  onAutoFocused?: () => void
}) {
  const [pending, startTransition] = React.useTransition()
  const [draft, setDraft] = React.useState(line)
  React.useEffect(() => setDraft(line), [line])
  const lineQuoteId = quoteId
  const dividerInputRef = React.useRef<HTMLInputElement | null>(null)
  React.useEffect(() => {
    if (autoFocus && dividerInputRef.current) {
      dividerInputRef.current.focus()
      dividerInputRef.current.select()
      onAutoFocused?.()
    }
  }, [autoFocus, onAutoFocused])

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

  // Section divider: full-width heading, editable label, no numeric cells.
  if (isSectionDivider(line)) {
    return (
      <TableRow className="bg-muted/60">
        <TableCell className="text-muted-foreground">{line.line_order}</TableCell>
        <TableCell colSpan={8}>
          {readOnly ? (
            <span className="text-sm font-semibold uppercase tracking-wide">
              {line.description}
            </span>
          ) : (
            <Input
              ref={dividerInputRef}
              className="h-8 border-0 bg-transparent text-sm font-semibold uppercase tracking-wide shadow-none focus-visible:ring-1"
              value={draft.description}
              placeholder="Section name"
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              onBlur={() =>
                draft.description !== line.description && save({ description: draft.description })
              }
            />
          )}
        </TableCell>
        {!readOnly && (
          <TableCell>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-red-600"
              aria-label="Delete section"
              onClick={() =>
                startTransition(async () => {
                  await deleteLineItem(line.id, lineQuoteId)
                  onChanged()
                })
              }
            >
              <Trash2 className="size-3.5" />
            </Button>
          </TableCell>
        )}
      </TableRow>
    )
  }

  if (readOnly) {
    return (
      <TableRow>
        <TableCell>{line.line_order}</TableCell>
        <TableCell>{line.description}</TableCell>
        <TableCell className="capitalize text-muted-foreground">{line.line_type}</TableCell>
        <TableCell className="text-right">{line.quantity}</TableCell>
        <TableCell>{line.unit ?? (defaultUnit(line.line_type) || "—")}</TableCell>
        <TableCell className="text-right">{formatMoney(line.unit_cost)}</TableCell>
        <TableCell className="text-right">{line.markup_pct ?? 0}%</TableCell>
        <TableCell className="text-right">{formatMoney(line.unit_price)}</TableCell>
        <TableCell className="text-right font-medium">{formatMoney(line.line_total)}</TableCell>
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
          placeholder={defaultUnit(draft.line_type)}
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
      <TableCell className="text-right text-muted-foreground">{formatMoney(line.unit_price)}</TableCell>
      <TableCell className="text-right font-medium">{formatMoney(line.line_total)}</TableCell>
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

  // When the user clicks "Add section heading", the newly-inserted divider's
  // id is bubbled up here so the matching LineRow can autofocus its label
  // input on the next render (i.e. drop the user straight into edit mode).
  // Cleared by the row once consumed.
  const [autoFocusLineId, setAutoFocusLineId] = React.useState<string | null>(null)
  const handleAdded = React.useCallback(
    (addedId?: string) => {
      refresh()
      if (addedId) setAutoFocusLineId(addedId)
    },
    [refresh],
  )

  const { similar, isLoading: similarLoading } = useSimilarQuotes(header)
  // Auto-open the drawer for a fresh draft (zero lines); stays closed once cloned/dismissed.
  const [drawerOpen, setDrawerOpen] = React.useState(
    () => !readOnly && initialLines.length === 0
  )

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
          <Button variant="outline" onClick={() => setDrawerOpen(true)}>
            Similar quotes ({similar.length})
          </Button>
          {/* Output views — open in a new tab so the editor stays in place
              behind the document preview. Both URLs live in the (print) route
              group; auth is enforced by proxy.ts. */}
          <Button variant="outline" asChild>
            <Link
              href={`/quotes/${quote.id}/customer`}
              target="_blank"
              rel="noopener"
            >
              Customer view
              <ExternalLink className="size-3.5" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link
              href={`/quotes/${quote.id}/workshop`}
              target="_blank"
              rel="noopener"
            >
              Workshop view
              <ExternalLink className="size-3.5" />
            </Link>
          </Button>
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

      {/* Line items — full content width */}
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
                  <LineRow
                    key={l.id}
                    line={l}
                    quoteId={quote.id}
                    readOnly={readOnly}
                    onChanged={refresh}
                    autoFocus={l.id === autoFocusLineId}
                    onAutoFocused={() => setAutoFocusLineId(null)}
                  />
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
          onAdded={handleAdded}
        />
      )}

      <TotalsFooter
        header={header}
        readOnly={readOnly}
        onChanged={refresh}
        routerRefresh={() => router.refresh()}
      />

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Similar past quotes</SheetTitle>
            <SheetDescription className="sr-only">
              Past quotes ranked by similarity; clone one to populate line items.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <SimilarQuotesPanel
              similar={similar}
              isLoading={similarLoading}
              quoteId={quote.id}
              onCloned={() => {
                refresh()
                setDrawerOpen(false)
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

// ----------------------------- totals + status (sticky footer) -----------------------------
function FooterStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-sm">
      <span className="text-muted-foreground">{label} </span>
      <span className="font-medium tabular-nums">{value}</span>
    </span>
  )
}

function TotalsFooter({
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
    // Sticky to the bottom of the scroll area; -mx-6 spans the main's padding.
    <div className="sticky bottom-0 z-20 -mx-6 border-t bg-background px-6 py-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <FooterStat label="Parts" value={formatMoney(header.subtotal_parts)} />
        <FooterStat label="Labour" value={formatMoney(header.subtotal_labour)} />
        <FooterStat label="Consumables" value={formatMoney(header.subtotal_consumables)} />
        <FooterStat label="Other" value={formatMoney(header.subtotal_other)} />

        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="text-lg font-semibold tabular-nums">{formatMoney(header.total)}</span>
        </div>

        {!readOnly && (
          <div className="flex items-center gap-2">
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
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      {header.sent_at && (
        <p className="mt-1 text-xs text-muted-foreground">Sent {formatDate(header.sent_at)}</p>
      )}
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
  /** The id of the row just added is passed back when it's a section heading,
   * so the parent can autofocus it (drop the user into edit mode). For plain
   * line items the id is omitted — they don't need focus handoff. */
  onAdded: (addedId?: string) => void
}) {
  const [lineType, setLineType] = React.useState<LineType>("part")
  const [description, setDescription] = React.useState("")
  const [sku, setSku] = React.useState("")
  const [quantity, setQuantity] = React.useState("1")
  const [unit, setUnit] = React.useState("")
  const [unitCost, setUnitCost] = React.useState("")
  const [markup, setMarkup] = React.useState(String(markupDefault))
  const [pending, startTransition] = React.useTransition()

  // Default unit cost to the labour rate when switching to a labour line. Unit is
  // left to the display default (not written) — see defaultUnit().
  React.useEffect(() => {
    if (lineType === "labour" && labourRate != null) {
      setUnitCost(String(labourRate))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineType])

  function addHeading() {
    startTransition(async () => {
      // 4b.1: insert with empty label and drop the user into edit mode (the
      // parent autofocuses the row that comes back with this id). The old
      // default of "New section" used to leak onto customer documents — the
      // output layer now strips placeholder labels, but the root cause is
      // killed here for all new quotes going forward.
      const res = await addLineItem(quoteId, {
        line_type: "other",
        description: "",
        quantity: 0,
        unit: null,
        unit_cost: 0,
        markup_pct: 0,
      })
      if (res.error) {
        toast.error("Could not add section heading", { description: res.error })
        return
      }
      toast.success("Section heading added")
      onAdded(res.id)
    })
  }

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
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Add line item</CardTitle>
        <Button variant="outline" size="sm" onClick={addHeading} disabled={pending}>
          Add section heading
        </Button>
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
            <Input
              className="w-20"
              value={unit}
              placeholder={defaultUnit(lineType)}
              onChange={(e) => setUnit(e.target.value)}
            />
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

