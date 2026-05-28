import { notFound } from "next/navigation"

import { CustomerDocHtml } from "@/components/quotes/output/customer-doc-html"
import { PrintActionBar } from "@/components/quotes/output/print-action-bar"
import { getQuoteForOutput } from "@/lib/quote-output"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export default async function CustomerViewPage({
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
        pdfHref={`/quotes/${model.quote.id}/customer/pdf`}
        label={`Customer view · ${model.quote.quoteNumber ?? "Quote"}`}
      />
      <CustomerDocHtml model={model} />
    </>
  )
}
