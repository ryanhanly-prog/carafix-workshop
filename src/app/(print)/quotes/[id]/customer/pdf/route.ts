import { createElement, type ReactElement } from "react"
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer"
import type { NextRequest } from "next/server"

import { CustomerDocPdf } from "@/components/quotes/output/customer-doc-pdf"
import { getQuoteForOutput } from "@/lib/quote-output"
import { createClient } from "@/lib/supabase/server"

// react-pdf renders via Node-native code paths (pdfkit). Next.js already lists
// @react-pdf/renderer on its auto-serverExternalPackages allow-list, but we
// also pin the runtime explicitly so this route never gets pushed onto the
// edge runtime by a future config change.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// route.ts uses React.createElement instead of JSX so the file stays a .ts
// route handler per Next 16's "route.js|ts" convention. CustomerDocPdf lives
// in customer-doc-pdf.tsx and uses JSX freely.
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const model = await getQuoteForOutput(supabase, id)
  if (!model) return new Response("Not found", { status: 404 })

  // CustomerDocPdf returns a <Document>, but TypeScript can't narrow that
  // through createElement; cast to the renderer's expected element type.
  const element = createElement(CustomerDocPdf, { model }) as unknown as ReactElement<DocumentProps>
  const buffer = await renderToBuffer(element)
  const filename = `quote-${model.quote.quoteNumber ?? model.quote.id}.pdf`
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
