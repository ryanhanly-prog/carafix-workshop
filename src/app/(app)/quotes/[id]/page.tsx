import { notFound } from "next/navigation"

import { QuoteEditor, type LineItem, type QuoteHeader } from "@/components/quotes/quote-editor"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const HEADER_COLS =
  "id, organisation_id, quote_number, status, canonical_job_type_id, description, damage_tags, subtotal_parts, subtotal_labour, subtotal_consumables, subtotal_other, total, sent_at, customers(name), vans(make, model, rego), job_type_canonical(id, name, category), insurers(name, capped_labour_rate)"
const LINE_COLS =
  "id, line_order, line_type, description, quantity, unit, unit_cost, markup_pct, unit_price, line_total, source, part_id"

export default async function QuoteViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: quote } = await supabase.from("quotes").select(HEADER_COLS).eq("id", id).single()
  if (!quote) notFound()

  const { data: lines } = await supabase
    .from("quote_line_items")
    .select(LINE_COLS)
    .eq("quote_id", id)
    .order("line_order")

  return (
    <QuoteEditor
      quote={quote as unknown as QuoteHeader}
      initialLines={(lines ?? []) as unknown as LineItem[]}
      markupDefault={0}
      labourRate={null}
      readOnly
    />
  )
}
