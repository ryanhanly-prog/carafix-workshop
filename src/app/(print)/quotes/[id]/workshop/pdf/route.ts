import { createElement, type ReactElement } from "react"
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer"
import type { NextRequest } from "next/server"

import { WorkshopDocPdf } from "@/components/quotes/output/workshop-doc-pdf"
import { getQuoteForOutput } from "@/lib/quote-output"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const model = await getQuoteForOutput(supabase, id)
  if (!model) return new Response("Not found", { status: 404 })

  const element = createElement(WorkshopDocPdf, { model }) as unknown as ReactElement<DocumentProps>
  const buffer = await renderToBuffer(element)
  const filename = `quote-${model.quote.quoteNumber ?? model.quote.id}-workshop.pdf`
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
