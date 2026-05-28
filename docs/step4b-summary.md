# Step 4b — Quote Output (Customer + Workshop) — Summary

Shipped on branch `step-4b-quote-output`. Eight commits, all individually
green (`next build` + `tsc` + `npm run lint`). No DB migrations.

## What shipped

- **Customer view** at `/quotes/[id]/customer` — branded, single-column,
  A4-portrait document. Hides cost / markup / unit cost. Section dividers
  render as full-row bold subheadings; labour lines append
  ` (N hrs @ $rate/hr)` to the verbatim stored description; subtotals come
  straight from the stored `quotes.subtotal_*` columns. Includes a 30-day
  validity statement, hardcoded terms block, and footer.
- **Customer PDF** at `/quotes/[id]/customer/pdf` — server-rendered via
  `@react-pdf/renderer`, A4 portrait, downloaded as `quote-Q-XXXXXX.pdf`.
- **Workshop view** at `/quotes/[id]/workshop` — internal-only counterpart.
  Red `INTERNAL USE ONLY — NOT FOR CUSTOMER` banner. Full 11-column table:
  #, Description, Type, Qty, Unit, Unit cost, Markup %, Unit price, Line
  total, Margin $, Margin %. Per-line + aggregate margin. Audit block
  (created by / created / last modified / status) in place of customer-facing
  terms.
- **Workshop PDF** at `/quotes/[id]/workshop/pdf` — A4 *landscape* (11
  columns don't fit portrait), filename `quote-Q-XXXXXX-workshop.pdf`.
- **Entry buttons** in the `QuoteEditor` header — one change exposes
  "Customer view" and "Workshop view" from both `/quotes/[id]` (read-only)
  and `/quotes/[id]/edit`. Both open in a new tab.
- **Location capture on quote create** — every new quote now records
  `location_id` from the user's currently-selected workshop location
  (top-right switcher), cascading to `app_users.default_location_id` then
  `NULL`. Sticky: the quote stays tied to the location it was raised at.

## Architecture choices worth knowing

- **Workshop branding is sourced from two tables, not from `brand.ts`.**
  `brand.ts` is the *platform* brand (Shopbook); tenant identity lives in
  `organisations`. The prompt originally asked for everything in `brand.ts`;
  we corrected to read tenant-level fields (`name`, `trading_name`, `abn`)
  from `organisations` and location-level fields (`address`, `phone`,
  `email`) from `locations` via `quote.location_id`. This means new
  workshops added later get their own branded PDFs with no code change.
- **`(print)` route group is chrome-free** — sibling to `(app)`, with its
  own minimal layout that does not include `AppShell`. Auth is enforced by
  `proxy.ts` (the Next 16 middleware rename) the same way as every other
  route. `[color-scheme:light]` + `bg-white` are forced so a dark-mode user
  previews exactly what the customer will receive.
- **Shared data fetcher.** `getQuoteForOutput(supabase, id)` in
  `src/lib/quote-output.ts` returns the single `QuoteOutputModel` consumed
  by all four renderers (customer HTML, customer PDF, workshop HTML,
  workshop PDF). Figures cannot drift between screen and print.
- **Section-divider heuristic mirrored, not reinvented.** A divider is an
  `other` line with `qty/unit_cost/line_total` all zero — same predicate as
  `quote-editor.tsx:104`. Diverging would have caused screen/print drift.
- **No SQL functions, no migrations.** Confirmed against the live DB before
  starting; the schema already had `quotes.location_id` and
  `locations.phone/email` after recent backfill work.

## Brand config additions

**None.** `src/lib/brand.ts` was deliberately untouched (decision in the
plan). Customer-facing terms are hardcoded in `customer-doc-pdf.tsx` /
`customer-doc-html.tsx` for v1.

## Performance

From `npx tsx scripts/step4b-selftest.ts` (full output stored in commit 8):

| Quote      | Lines | Customer PDF | Workshop PDF |
| ---------- | ----- | -----------: | -----------: |
| Q-100001   | 9     |       114 ms |       101 ms |
| Q-100004   | 10    |        59 ms |        92 ms |

The 114 ms on Q-100001 includes one-off module + font lazy-init cost on the
first `renderToBuffer` call; subsequent renders settle ~60–100 ms. **Well
under the 2 s target** (the user's stated soft budget, 3 s ceiling). Largest
quote in the data set is 10 lines; behaviour at 50–100 lines hasn't been
measured but `renderToBuffer` scales roughly linearly with content, so we
have ~30× headroom before the budget bites.

## Self-test outcome

`scripts/step4b-selftest.ts` — 35 / 35 checks pass:

- Q-100001 model assembly: totals + per-subtotal values match `quotes.*`
  columns exactly. Divider detection matches the editor heuristic (2 / 2).
  Per-line margin = `(unit_price − unit_cost) × quantity` on every
  non-divider line. Labour suffix `" (6 hrs @ $140.91/hr)"` /
  `" (9.5 hrs @ $140.91/hr)"` present on both labour lines.
- Workshop branding: name `"Carafix Caravan Repairs"`, ABN `66663914154`,
  Arundel address / phone / email all resolve correctly through the
  `quote.location_id → locations` join.
- Both PDFs render with `%PDF-` magic bytes for both fixture quotes.
- **No-insurer edge case**: throwaway quote inserted with
  `insurer_id = NULL` — `model.insurer === null`, customer PDF renders, then
  fixture deleted.
- **NULL-location edge case**: throwaway quote inserted with
  `location_id = NULL` — `workshop.{name,abn}` still populated;
  `workshop.{address,phone,email,locationName}` all `null`; both PDFs render
  without crashing; fixture deleted.

## Rough edges to spot-check in James's first use

- The action bar above each document view is sticky and visible on screen
  but hidden in print; only spot worth checking is that the **Print** button
  actually prints without the bar (it does in headless tests but real-world
  printers vary).
- **Labour description prefixes** are not cleaned. Real data looks like
  `"LAB - Labour - RE-SEALING"`; the PDF appends ` (6 hrs @ $140.91/hr)` to
  that verbatim. James may want a one-off pass through the corpus to clean
  these prefixes — out of scope for 4b.
- **Currency formatting on margin** rounds to two decimal places, but the
  margin% display rounds to one decimal. Consistent across HTML + PDF but
  worth a sanity check against how James reports margin internally.

## Intentionally deferred

- Editable terms text (would be `organisations.terms_text` + settings UI).
- Editable workshop / location contact details (settings UI).
- Per-insurer PDF layout variants (assess after James actually uses the
  generic one in front of an insurer).
- Logo upload — v1 uses the workshop trading name as a text wordmark.
- Email-the-PDF / e-signature / quote versioning — all per the prompt.
- Performance behaviour at 50+ line quotes — unmeasured; revisit if James
  builds anything that large.
