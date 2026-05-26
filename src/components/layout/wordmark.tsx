import { BRAND } from "@/lib/brand"
import { cn } from "@/lib/utils"

// Inline SVG wordmark so `fill="currentColor"` picks up the surrounding text
// colour (light/dark). Mirrors public/brand/wordmark.svg; the text is driven by
// BRAND.name so a rebrand only touches src/lib/brand.ts.
export function Wordmark({ className }: { className?: string }) {
  return (
    <svg
      width="160"
      height="32"
      viewBox="0 0 160 32"
      className={cn("h-6 w-auto", className)}
      role="img"
      aria-label={BRAND.name}
    >
      <text
        x="0"
        y="22"
        fontFamily="var(--font-sans), Inter, system-ui, sans-serif"
        fontSize="22"
        fontWeight="700"
        fill="currentColor"
      >
        {BRAND.name}
      </text>
    </svg>
  )
}
