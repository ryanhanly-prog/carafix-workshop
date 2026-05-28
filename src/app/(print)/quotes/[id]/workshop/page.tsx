import { notFound } from "next/navigation"

import { PrintActionBar } from "@/components/quotes/output/print-action-bar"
import { WorkshopDocHtml } from "@/components/quotes/output/workshop-doc-html"
import { getQuoteForOutput } from "@/lib/quote-output"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export default async function WorkshopViewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const model = await getQuoteForOutput(supabase, id)
  if (!model) notFound()

  return (
    <>
      <PrintActionBar
        quoteId={model.quote.id}
        pdfHref={`/quotes/${model.quote.id}/workshop/pdf`}
        label={`Workshop view · ${model.quote.quoteNumber ?? "Quote"}`}
      />
      <WorkshopDocHtml model={model} />
    </>
  )
}
