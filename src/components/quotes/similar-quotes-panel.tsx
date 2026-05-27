"use client"

import * as React from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import { useQuery } from "@tanstack/react-query"
import { Copy } from "lucide-react"
import { toast } from "sonner"

import { MatchReasonBadge } from "@/components/quotes/match-reason-badge"
import { Button } from "@/components/ui/button"
import { cloneIntoQuote } from "@/lib/actions/quotes"
import { getBrowserClient } from "@/lib/supabase/browser"
import { cn } from "@/lib/utils"

export type SimilarQuoteContext = {
  id: string
  organisation_id: string
  canonical_job_type_id: string
  description: string | null
  damage_tags: string[] | null
  vans: { make: string | null; model: string | null } | null
}

type Similar = {
  id: string
  source: "live" | "historical"
  score: number
  vehicle: string | null
  preview_text: string | null
  match_reasons: string[] | null
  line_count: number
  total: number | null
  parts_total: number | null
  labour_total: number | null
  total_labour_hours: number | null
  issue_date: string | null
}

const money = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n)

function monthYear(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-AU", { month: "short", year: "numeric" })
}

function monthsAgo(iso: string | null): number {
  if (!iso) return Infinity
  const d = new Date(iso)
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.4)
}

function SimilarCard({
  s,
  best,
  cloning,
  onClone,
}: {
  s: Similar
  best: boolean
  cloning: boolean
  onClone: () => void
}) {
  const stale = monthsAgo(s.issue_date) > 18
  const reasons = (s.match_reasons ?? []).slice().sort((a, b) => {
    // strong signals first
    const weight = (r: string) =>
      r.startsWith("damage_tags:") ? 0 : r === "description_match" ? 1 : r === "job_type" ? 2 : 3
    return weight(a) - weight(b)
  })

  return (
    <div className={cn("rounded-md border p-2.5 text-sm", best && "border-2 border-primary p-3")}>
      {best && (
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
          Best match
        </div>
      )}
      {/* Row 1 — vehicle + source/score */}
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold">{s.vehicle || "Unknown vehicle"}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {s.source} · score {Math.round(s.score)}
        </span>
      </div>
      {/* Row 2 — preview */}
      <p className="mt-0.5 line-clamp-2 text-xs italic text-muted-foreground">
        {s.preview_text?.trim()
          ? s.preview_text
          : "No description available — matched on vehicle."}
      </p>
      {/* Row 3 — match reasons */}
      {reasons.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {reasons.map((r) => (
            <MatchReasonBadge key={r} reason={r} />
          ))}
        </div>
      )}
      {/* Row 4 — shape */}
      <div className="mt-1.5 text-xs text-muted-foreground">
        {s.line_count} lines
        {s.total_labour_hours ? ` · ${Math.round(Number(s.total_labour_hours))}hr` : ""} ·{" "}
        {money(s.total)} ·{" "}
        <span className={cn(stale && "font-medium text-orange-600")}>{monthYear(s.issue_date)}</span>
      </div>
      {/* Row 5 — action */}
      <Button size="sm" variant="secondary" className="mt-2 w-full" disabled={cloning} onClick={onClone}>
        <Copy className="size-3.5" /> Clone all lines
      </Button>
    </div>
  )
}

// Query hook — lifted out so the editor can show the match count on the trigger
// button while the drawer renders the list. A clean seam for swapping retrieval
// strategies (e.g. embedding-based) later. Self-exclusion is handled in SQL via
// p_exclude_quote_id; there is no score threshold — every row is shown.
export function useSimilarQuotes(quote: SimilarQuoteContext | null) {
  const supabase = getBrowserClient()
  const query = useQuery({
    queryKey: ["similar", quote?.id],
    enabled: !!quote,
    queryFn: async () => {
      const looseRpc = supabase as unknown as SupabaseClient
      const { data, error } = await looseRpc.rpc("find_similar_quotes", {
        p_organisation_id: quote!.organisation_id,
        p_canonical_job_type_id: quote!.canonical_job_type_id,
        p_vehicle_make: quote!.vans?.make ?? null,
        p_vehicle_model: quote!.vans?.model ?? null,
        p_description: quote!.description ?? null,
        p_damage_tags: quote!.damage_tags ?? null,
        p_exclude_quote_id: quote!.id,
      })
      if (error) {
        toast.error("Could not load similar quotes", { description: error.message })
        throw error
      }
      return (data as unknown as Similar[]) ?? []
    },
  })
  return { similar: query.data ?? [], isLoading: query.isLoading }
}

// Presentational — receives the matches; lives inside the slide-over drawer.
export function SimilarQuotesPanel({
  similar,
  isLoading,
  quoteId,
  onCloned,
}: {
  similar: Similar[]
  isLoading: boolean
  quoteId: string
  onCloned: () => void
}) {
  const [cloning, startTransition] = React.useTransition()

  // "Best match" treatment only when the top result is meaningfully ahead.
  const showBest =
    similar.length >= 2 && similar[0].score >= 1.5 * Math.max(similar[1].score, 0.01) && similar[0].score > 0

  function clone(s: Similar) {
    startTransition(async () => {
      const res = await cloneIntoQuote(quoteId, s.id, s.source)
      if (res.error) {
        toast.error("Clone failed", { description: res.error })
        return
      }
      toast.success(`Cloned ${res.count} line(s)`)
      onCloned()
    })
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Searching…</p>
  }
  if (similar.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No similar past quotes found. Start from scratch by adding line items below.
      </p>
    )
  }
  return (
    <div className="space-y-2">
      {similar.map((s, i) => (
        <SimilarCard
          key={`${s.source}-${s.id}`}
          s={s}
          best={showBest && i === 0}
          cloning={cloning}
          onClone={() => clone(s)}
        />
      ))}
    </div>
  )
}
