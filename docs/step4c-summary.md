# Step 4c — Pricing Intelligence (Part 1) — Summary

Shipped on branch `step-4c-pricing-intelligence`. Six commits, each
individually green (`next build` + `tsc --noEmit` + `npm run lint`
baseline unchanged at 8 problems / 7 errors / 1 warning, identical to
main). Not merged — awaiting review.

## What shipped

- **`sku_price_stats` table** (migration 0029) — precomputed per-org
  per-SKU pricing norms. One row per `(organisation_id, stock_number)`
  with `uses`, `median_cost`, `median_price`, `median_markup_pct`,
  `last_price`, `last_cost`, `last_used_date`, `refreshed_at`. RLS-scoped
  read; only the security-definer refresh function writes. 1,647 SKUs
  for Carafix after the `uses >= 3` cull (of the raw 3,372 distinct
  historical SKUs).
- **`refresh_sku_price_stats(p_org uuid)` function** — rebuilds the stats
  for one org (or all when `p_org` is null) from
  `historical_invoice_items`. Filters mirror the spec: non-empty
  `stock_number`, `stock_number <> 'LAB'`, `unit_price > 0`,
  `HAVING count(*) >= 3`. Medians via `percentile_cont(0.5)`; markup
  median only over rows with `unit_cost > 0`; `last_*` via
  `distinct on … order by created_at_external desc`. The migration calls
  it once for Carafix on landing; future refresh is manual (v1).
- **`get_quote_anchors(p_quote_id uuid)` function** (migration 0030) —
  returns one row per `line_type='part'` line of a quote with the
  resolved SKU (`part_id`-first, parse fallback on
  `split_part(description, ' - ', 1)`), stats joined from
  `sku_price_stats`, a `below_typical_pct` (null unless `unit_price`
  is >5% below `median_price`), and a quote-level `allow_nudge`
  boolean computed from `canonical_job_type_id → category` (false on
  `insurance`/`warranty`). Security invoker; granted to `authenticated`.
- **Per-line margin display** in the editor — `marginFor()` and
  `totalMargin()` in `src/lib/margin.ts`; secondary text under each
  Line total cell (`22.0% margin`) with hover tooltip showing margin $;
  suppressed on labour and dividers per spec. Sticky footer now shows
  `Margin $1,695.30 · 63.0%` alongside the existing Parts/Labour/
  Consumables/Other subtotals.
- **Anchor strip** — 11px tabular-nums muted secondary text under the
  Description input on resolved part lines:
  `typical $27.00 · markup 127% · 500 uses`. Hover/focus opens a
  Tooltip with the full detail (typical sell/cost/markup, last price,
  last used date, total uses). Renders nothing when the SKU is
  unresolvable or absent from stats — no placeholder, no error.
- **Below-norm nudge dot** — a soft amber 8px dot inside the unit-price
  cell when `below_typical_pct ≠ null AND allow_nudge=true AND not
  dismissed`. Click/focus opens a Popover with `−9.1%`-style figure and
  a dismiss `×`. Session-scoped dismissal (`Set<line_id>` in
  `QuoteEditor` state); resets on reload, no DB persistence in v1.
  Insurance/warranty quotes render no dot regardless of price.
- **`useQuoteAnchors(quoteId)` hook** — TanStack Query wrapper around
  the `get_quote_anchors` RPC; invalidated by the existing `refresh()`
  on any line change.
- **`src/lib/database.types.ts` regenerated** — the new RPC and table
  are now typed.

## Architecture choices worth knowing

- **Stats source is `historical_invoice_items` only** (open question #3,
  recommendation kept). Transacted truth is a stronger signal than
  quoted intent; ~30,720 SKU'd rows over 3 years for Carafix is already
  a tight sample. Quotes would dilute medians with un-won bids. The
  future live-invoiced flywheel is deliberately out of scope until
  Shopbook owns invoicing.
- **Retail/insurance gating lives in the function**, not the caller
  (open question #2). `get_quote_anchors` returns `allow_nudge` as a
  quote-level boolean denormalised onto every row. One round-trip; UI
  can't drift from spec by re-deriving.
- **Resolution priority is `part_id` first, then parse.** `part_id` is
  currently NULL on 100% of live lines (clone never set it), so v1
  takes the parse path everywhere; future parts-picker work will flip
  most lines to `part_id` without any function change.
- **The validation guard lives in the SQL** — `sku_price_stats` only
  contains SKUs with `uses >= 3`, so a `LEFT JOIN` miss is the same
  signal as "no anchor"; the UI just renders nothing when
  `median_price` is null. Junk like `"DECAL SET"` (parsed from
  `"DECAL SET - LEADER GOLD"`) cleanly produces no anchor without
  any UI-side filter.
- **Refresh is manual** (open question #4). Called once at the end of
  migration 0029 for Carafix; future admin tooling can re-run via the
  service role. No cron, no triggers — the data is historical, not
  live.
- **Editor's margin math doesn't share code with the workshop PDF.**
  `src/lib/margin.ts` is new; `src/lib/quote-output.ts` still has the
  inline math from 4b. Both produce identical figures by definition
  (same formula); a future refactor can collapse them. Skipped here
  to keep the 4c diff narrow.

## Self-test results (asserted via MCP)

| # | What | Result |
|---|---|---|
| 1 | Stats sanity (FIX15 / CT6WH medians + no LAB row) | Pass — 21766421 uses=500 median=$27.00; SILADRGTR/CT6WH uses=213 median=$17.00; LAB excluded; 0 rows below `uses<3` threshold |
| 2 | Q-100001 resolves 5 part lines via parse | Pass — CONSUM, SILADRGTR/CT6TR, 21766421, SILADRGTR/CT6WH, PPWCT2441223 all `resolution_source='description_parse'` |
| 3 | Below-norm detection | Pass — FIX15 9.1%, CT6WH 9.1%, plywood 14.0%; CT6TR null (exact); CONSUM null (above typical) |
| 4 | Validation guard | Pass — temp fixture `'DECAL SET - LEADER GOLD'` parsed to `'DECAL SET'`, stats null, no anchor; fixture deleted |
| 5 | Labour & dividers excluded | Pass — `line_type='part'` filter in `get_quote_anchors`; `LineMarginSecondary` returns null on labour/divider |
| 6 | Retail gating | Pass — service-category fixture: `allow_nudge=true`; insurance-category fixture: `allow_nudge=false`; fixtures deleted |
| 7 | Margin math | Pass — Q-100001 total margin $1,695.30 / 63.0% matches the 4b workshop PDF figure exactly |
| 8 | Performance | Pass — `get_quote_anchors(Q-100001)` execution time **3.28 ms** (budget <300 ms) |
| 9 | Build / tsc / lint | Pass — `next build` green, `tsc --noEmit` clean, lint baseline preserved (8 problems / 7 errors / 1 warning, identical set to main) |

## Performance numbers

- `get_quote_anchors(Q-100001)` (9 lines, 5 part lines): **3.28 ms**
  execution + 0.53 ms planning. ~90x headroom on the 300 ms budget.
- Anchor fetch is one RPC per quote load; cached by TanStack Query for
  30 s and invalidated on `refresh()`.
- Refresh from `historical_invoice_items` (30,720 source rows) runs in
  under a second on the migration; rebuild is rare and out-of-band.

## Rough edges to spot-check in the browser

- Anchor strip under Description adds a second row of visual content to
  each part line — confirms cleanly when there's room; spot-check on a
  very narrow viewport.
- Tooltip detail (multi-line key:value grid) renders against the
  shadcn default dark-on-light tooltip background. Used `opacity-70`
  for secondary lines instead of `text-muted-foreground` so contrast
  works in both themes — please eyeball.
- Nudge dot dismissal is session-scoped only — reloading the page
  re-shows the dot. If James wants persistent dismissal across
  sessions, that's a follow-up commit (add a `quote_line_dismissals`
  table or a JSON column on `quote_line_items`).
- Q-100001 is insurance, so on that real quote you'll see the anchor
  strips but no amber dots — by design. To see the nudge UI you'd need
  a retail quote with a below-typical part line (or temporarily flip
  Q-100001's job type for a visual sanity check).

## Files added / changed

```
supabase/migrations/0029_sku_price_stats.sql        (new)
supabase/migrations/0030_get_quote_anchors.sql      (new)
src/lib/margin.ts                                   (new)
src/lib/database.types.ts                           (regenerated via MCP)
src/components/quotes/quote-editor.tsx              (anchors + margin + nudge)
docs/step4c-summary.md                              (this file)
```

## Intentionally deferred

- Smart draft assembly / "start from your typical quote" (4d).
- Quote-level benchmark ("vs typical quote") — cohorts verified too
  thin; deliberately cut.
- Labour-hours intelligence / per-task labour anchoring (4d).
- Live invoiced data feeding the stats flywheel (post-invoicing).
- Parts-picker / autocomplete that would populate `part_id` (separate
  backlog; this step's parse-fallback bridges it).
- Persisted dismissal of the below-norm nudge across sessions.
- Refactoring `quote-output.ts` to call into `src/lib/margin.ts` —
  same math, kept separate to narrow the 4c diff.
- Refresh trigger automation (cron / on-import).
- Job-type- or insurer-conditioned per-SKU stats (global is correct —
  part prices are context-independent).
