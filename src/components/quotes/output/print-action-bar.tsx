"use client"

import Link from "next/link"
import { ArrowLeft, Download, Printer } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Top-of-page action bar for /quotes/[id]/customer and /quotes/[id]/workshop.
 * Sits inside the (print) layout's .quote-output-root, so the print-hidden
 * class drops it from Ctrl-P output (rule in globals.css). Client-side only
 * because Print needs window.print().
 */
export function PrintActionBar({
  quoteId,
  pdfHref,
  label,
}: {
  quoteId: string
  pdfHref: string
  label: string
}) {
  return (
    <div className="print-hidden sticky top-0 z-10 border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-3 text-neutral-900">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/quotes/${quoteId}`}>
              <ArrowLeft className="size-4" />
              Back to quote
            </Link>
          </Button>
          <span className="text-xs text-neutral-500">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="size-4" />
            Print
          </Button>
          <Button size="sm" asChild>
            {/* Plain <a>, not next/link: the route handler returns
                Content-Disposition: attachment so the browser downloads
                rather than navigating. */}
            <a href={pdfHref}>
              <Download className="size-4" />
              Download PDF
            </a>
          </Button>
        </div>
      </div>
    </div>
  )
}
