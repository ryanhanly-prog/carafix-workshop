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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatDate, formatMoney } from "@/lib/format"
import { marginFor, totalMargin } from "@/lib/margin"
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

// ----------------------------- anchors -----------------------------
// One row per part line returned by the get_quote_anchors RPC (migration
// 0030). The function resolves a SKU per line, joins sku_price_stats, and
// computes below_typical_pct + a quote-level allow_nudge boolean (false on
// insurance/warranty). UI never re-derives the gating.
type QuoteAnchor = {
  line_id: string
  resolved_stock_number: string | null
  resolution_source: string | null
  uses: number | null
  median_cost: number | null
  median_price: number | null
  median_markup_pct: number | null
  last_price: number | null
  last_cost: number | null
  last_used_date: string | null
  below_typical_pct: number | null
  allow_nudge: boolean
}

function useQuoteAnchors(quoteId: string) {
  const supabase = getBrowserClient()
  return useQuery({
    queryKey: ["quote-anchors", quoteId],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_quote_anchors", { p_quote_id: quoteId })
      const map = new Map<string, QuoteAnchor>()
      for (const row of (data as QuoteAnchor[] | null) ?? []) {
        map.set(row.line_id, row)
      }
      return map
    },
    staleTime: 30 * 1000,
  })
}

// Secondary text strip beneath the Description input on a part line, when
// the SKU resolved AND was found in sku_price_stats with uses >= 3 (the
// validation guard lives in the SQL — by the time median_price is non-null
// here we know the sample is large enough). Hover/focus opens a Tooltip
// with the full detail. Lines without a resolved/known SKU render nothing —
// no placeholder, no error, per spec.
function AnchorStrip({ anchor }: { anchor: QuoteAnchor | undefined }) {
  if (!anchor || anchor.median_price == null) return null
  const price = Number(anchor.median_price)
  const markup =
    anchor.median_markup_pct == null ? null : Number(anchor.median_markup_pct)
  const uses = anchor.uses ?? 0
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="mt-1 cursor-help text-[11px] tabular-nums text-muted-foreground">
          typical {formatMoney(price)}
          {markup != null ? ` · markup ${markup.toFixed(0)}%` : ""}
          {` · ${uses.toLocaleString()} uses`}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-none">
        <div className="space-y-1 text-xs">
          {anchor.resolved_stock_number && (
            <div className="font-semibold tabular-nums">
              SKU {anchor.resolved_stock_number}
            </div>
          )}
          <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-0.5 tabular-nums">
            <span className="opacity-70">Typical sell</span>
            <span className="text-right">{formatMoney(price)}</span>
            {anchor.median_cost != null && (
              <>
                <span className="opacity-70">Typical cost</span>
                <span className="text-right">
                  {formatMoney(Number(anchor.median_cost))}
                </span>
              </>
            )}
            {markup != null && (
              <>
                <span className="opacity-70">Typical markup</span>
                <span className="text-right">{markup.toFixed(1)}%</span>
              </>
            )}
            {anchor.last_price != null && (
              <>
                <span className="opacity-70">Last price</span>
                <span className="text-right">
                  {formatMoney(Number(anchor.last_price))}
                </span>
              </>
            )}
            {anchor.last_used_date && (
              <>
                <span className="opacity-70">Last used</span>
                <span className="text-right">{formatDate(anchor.last_used_date)}</span>
              </>
            )}
          </div>
          <div className="pt-1 text-[10px] opacity-70">
            {uses.toLocaleString()} uses across the corpus
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

// Soft amber dot inside the unit-price cell when a part line is more than
// 5% below the SKU's typical sell AND the quote is retail (allow_nudge
// from get_quote_anchors — false on insurance/warranty). Click/focus opens
// a small popover with the typical figure and a dismiss button.
//
// Dismissal is session-scoped (component state in QuoteEditor) — closing
// the popover hides the dot until the page reloads. No DB write; v1.
// Never red, never a banner. Above-typical is intentionally NEVER flagged
// (often intentional pricing).
function NudgeDot({
  anchor,
  dismissed,
  onDismiss,
  readOnly,
}: {
  anchor: QuoteAnchor | undefined
  dismissed: boolean
  onDismiss: () => void
  readOnly: boolean
}) {
  if (!anchor) return null
  if (anchor.below_typical_pct == null) return null
  if (!anchor.allow_nudge) return null
  if (dismissed) return null
  const median = anchor.median_price == null ? null : Number(anchor.median_price)
  const pct = Number(anchor.below_typical_pct)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Below typical price (-${pct.toFixed(1)}%)`}
          className="inline-block size-2 rounded-full bg-amber-500/70 transition-transform hover:scale-125 focus-visible:scale-125 focus-visible:outline-none"
        />
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-auto p-3 text-xs">
        <div className="flex items-start gap-4">
          <div className="space-y-0.5">
            <div className="text-muted-foreground">
              Below your typical {median == null ? "—" : formatMoney(median)}
            </div>
            <div className="font-semibold tabular-nums">−{pct.toFixed(1)}%</div>
          </div>
          {!readOnly && (
            <button
              type="button"
              aria-label="Dismiss"
              onClick={onDismiss}
              className="text-base leading-none text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              ×
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// Per-line margin readout under the Line total cell. Hidden on labour
// (labour cost basis is the rate question, deferred) and dividers. The
// percentage is the primary number; hover reveals the dollar value. 11px
// muted secondary matches the editor's restraint elsewhere — anchors and
// margins are marginalia, not headline figures.
function LineMarginSecondary({ line }: { line: LineItem }) {
  const divider = isSectionDivider(line)
  if (divider || line.line_type === "labour") return null
  const { marginDollars, marginPct } = marginFor({
    line_type: line.line_type,
    quantity: line.quantity,
    unit_cost: line.unit_cost,
    unit_price: line.unit_price,
    line_total: line.line_total,
    isDivider: divider,
  })
  if (marginPct == null) {
    // Line has no revenue yet (e.g. fresh empty line) — render nothing
    // rather than a noisy em dash.
    return null
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-default text-[11px] font-normal tabular-nums text-muted-foreground">
          {marginPct.toFixed(1)}% margin
        </div>
      </TooltipTrigger>
      <TooltipContent side="left">{formatMoney(marginDollars)} margin</TooltipContent>
    </Tooltip>
  )
}

// ----------------------------- editable row -----------------------------
function LineRow({
  line,
  anchor,
  nudgeDismissed,
  onDismissNudge,
  quoteId,
  readOnly,
  onChanged,
  autoFocus = false,
  onAutoFocused,
}: {
  line: LineItem
  /** Precomputed anchor for this line (one row from get_quote_anchors),
   * undefined when the line has no resolvable SKU or the quote isn't a part
   * line. The function only returns part lines. */
  anchor?: QuoteAnchor
  /** Whether James has dismissed the below-norm nudge for this line in the
   * current session. Session-scoped only (no DB write in v1). */
  nudgeDismissed: boolean
  onDismissNudge: () => void
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
        <TableCell>
          <div>{line.description}</div>
          <AnchorStrip anchor={anchor} />
        </TableCell>
        <TableCell className="capitalize text-muted-foreground">{line.line_type}</TableCell>
        <TableCell className="text-right">{line.quantity}</TableCell>
        <TableCell>{line.unit ?? (defaultUnit(line.line_type) || "—")}</TableCell>
        <TableCell className="text-right">{formatMoney(line.unit_cost)}</TableCell>
        <TableCell className="text-right">{line.markup_pct ?? 0}%</TableCell>
        <TableCell className="text-right">
          <div className="inline-flex items-center justify-end gap-1.5">
            <NudgeDot
              anchor={anchor}
              dismissed={nudgeDismissed}
              onDismiss={onDismissNudge}
              readOnly
            />
            {formatMoney(line.unit_price)}
          </div>
        </TableCell>
        <TableCell className="text-right font-medium">
          <div className="tabular-nums">{formatMoney(line.line_total)}</div>
          <LineMarginSecondary line={line} />
        </TableCell>
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
        <AnchorStrip anchor={anchor} />
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
      <TableCell className="text-right text-muted-foreground">
        <div className="inline-flex items-center justify-end gap-1.5">
          <NudgeDot
            anchor={anchor}
            dismissed={nudgeDismissed}
            onDismiss={onDismissNudge}
            readOnly={false}
          />
          {formatMoney(line.unit_price)}
        </div>
      </TableCell>
      <TableCell className="text-right font-medium">
        <div className="tabular-nums">{formatMoney(line.line_total)}</div>
        <LineMarginSecondary line={line} />
      </TableCell>
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

  const { data: anchors } = useQuoteAnchors(quote.id)

  // Session-scoped dismissal: line_ids whose below-norm nudge James has
  // closed in this tab. Resets on reload — no DB persistence in v1.
  const [dismissedNudges, setDismissedNudges] = React.useState<Set<string>>(
    () => new Set(),
  )
  const dismissNudge = React.useCallback((lineId: string) => {
    setDismissedNudges((prev) => {
      const next = new Set(prev)
      next.add(lineId)
      return next
    })
  }, [])

  const refresh = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["quote", quote.id] })
    qc.invalidateQueries({ queryKey: ["qli", quote.id] })
    // Editing a line can change its description (→ resolved SKU) or its
    // unit_price (→ below_typical_pct). Always re-fetch anchors after a
    // line change.
    qc.invalidateQueries({ queryKey: ["quote-anchors", quote.id] })
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
                    anchor={anchors?.get(l.id)}
                    nudgeDismissed={dismissedNudges.has(l.id)}
                    onDismissNudge={() => dismissNudge(l.id)}
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
        lines={lines}
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
  lines,
  readOnly,
  onChanged,
  routerRefresh,
}: {
  header: QuoteHeader
  lines: LineItem[]
  readOnly: boolean
  onChanged: () => void
  routerRefresh: () => void
}) {
  const [pending, startTransition] = React.useTransition()
  // Total margin is computed client-side from the lines we already have —
  // mirrors the workshop PDF's accumulator so the two figures always agree.
  // Q-100001 produces $1,695.30 / 63.0% (asserted via MCP, self-test #7).
  const margin = React.useMemo(
    () =>
      totalMargin(
        lines.map((l) => ({
          line_type: l.line_type,
          quantity: l.quantity,
          unit_cost: l.unit_cost,
          unit_price: l.unit_price,
          line_total: l.line_total,
          isDivider: isSectionDivider(l),
        })),
      ),
    [lines],
  )
  const marginValue =
    margin.marginPct == null
      ? formatMoney(margin.marginDollars)
      : `${formatMoney(margin.marginDollars)} · ${margin.marginPct.toFixed(1)}%`
  return (
    // Sticky to the bottom of the scroll area; -mx-6 spans the main's padding.
    <div className="sticky bottom-0 z-20 -mx-6 border-t bg-background px-6 py-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <FooterStat label="Parts" value={formatMoney(header.subtotal_parts)} />
        <FooterStat label="Labour" value={formatMoney(header.subtotal_labour)} />
        <FooterStat label="Consumables" value={formatMoney(header.subtotal_consumables)} />
        <FooterStat label="Other" value={formatMoney(header.subtotal_other)} />
        <FooterStat label="Margin" value={marginValue} />

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

