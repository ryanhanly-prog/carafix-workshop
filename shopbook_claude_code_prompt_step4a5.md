# Step 4a.5 — Line Item Rendering + Panel + Dropdown Polish

**Context for Claude Code:** Step 4a.4 (quote editor layout polish) shipped clean. The drafting surface now uses full width, totals sit in a sticky footer, similar quotes opens as a slide-over. This step clears the next batch of small UX issues surfaced during real-data testing.

Five focused fixes across three areas — line item rendering, similar-quotes panel, vehicle dropdown. No schema changes. No new business logic. Pure UI refinement.

## Goals

1. Render "section divider" lines from cloned historical quotes differently than editable line items.
2. Default the Unit column based on line type.
3. Show the canonical job type **name** (not id) in the similar-quotes match-reason badge.
4. Make the vehicle dropdown richer — year and rego visible alongside make/model.
5. While in similar-quotes, also surface the issue_date prominently as a "stale pricing" cue (already in the data, just needs better display).

## Detailed scope

### 1. Section divider rendering (line items table)

When a quote is cloned from a historical source, some line items appear as `type='other'` with `qty=0`, `unit_cost=0`, `markup_pct=0` and a description that's actually a section header from the source data (e.g. "ROOF REPAIR SECTION" or just "description" as a placeholder).

These should render as visually distinct rows:
- Spanning the full table width (no editable cells)
- Bold or differently-coloured background to signal "this is a heading, not a line"
- Description text editable inline (so James can rename them)
- Quantity / unit / unit_cost / markup / unit_price / line_total columns hidden or shown as blank cells
- A small "delete" affordance still available

Detection logic: a line item is a section divider when `line_type='other' AND quantity=0 AND unit_cost=0 AND line_total=0`. This catches the cloned cases without needing a new column. Don't add a column — derive the rendering from existing data.

When James manually adds a new line, the dropdown for type should NOT include a "divider" option as a separate type. Instead, add a small "Add section heading" button next to the existing "Add line item" button. That button creates a new line with line_type='other' and all numeric fields zeroed.

### 2. Unit column defaults by line type

Currently, the Unit column is empty across cloned lines because historical data doesn't have units. When a new line item is created (either added manually or rendered for the first time from a clone that has NULL unit), default the Unit display based on line_type:

- `line_type='labour'` → 'hr'
- `line_type='part'` → 'each'
- `line_type='consumable'` → 'each'
- `line_type='freight'` → 'each'
- `line_type='other'` → blank (no default)

**Important: this is a display default, not a database write.** Don't backfill the unit column on quote_line_items. The rendering should fall back to the type-based default when unit is NULL. James can override by editing the cell; if he edits, the override persists. If he clears it back to empty, it returns to the type-based default.

### 3. Job type badge — name not id

Currently the similar-quotes match-reason badge for `job_type` shows the canonical job type id (a uuid). Should show the human-readable name. Flagged in 4a.1's summary.

The `find_similar_quotes` SQL function currently returns `match_reasons text[]` with the id baked into the string. Two ways to fix:

- **Option A (recommended):** modify `find_similar_quotes` to return the canonical name in match_reasons (join to `job_type_canonical` and substitute the name). Pure SQL change, no UI work.
- **Option B:** keep the id in match_reasons, have the UI resolve id-to-name via a lookup. Adds a query.

Use Option A. Single round-trip, source of truth in SQL.

### 4. Vehicle dropdown richness

On `/quotes/new`, the vehicle dropdown currently shows just `make model` for each van. When a customer has multiple similar vans, James can't tell them apart. Show:

`{make} {model} · {year} · {rego}`

Examples:
- "Jayco Starcraft · 2021 · QXY-123"
- "Jayco Conquest · 2019 · ABC-789"
- "Jayco Starcraft · — · —" (year or rego null)

If year is null, render an em-dash placeholder. Same for rego. Don't hide the field or render "null".

Apply the same enrichment to the existing-vehicle picker anywhere else it appears (van edit dialog from 4a.3 uses individual fields, fine — but any other vehicle-selector dropdown gets the same treatment).

### 5. Issue date prominence in similar-quotes panel

The similar-quotes cards already include `issue_date` in the data returned by `find_similar_quotes`. Surface it more prominently in the card rendering:

- Show date as `MMM YYYY` (e.g. "Mar 2024", "Sept 2025")
- Display in the shape line alongside line count / total / labour hours
- If the date is older than 18 months (calculated from `now()` at render time), render it in muted orange to signal "pricing may be stale"
- If the date is within the last 6 months, no special treatment (still recent)

Already partially implemented in 4a.1 — verify it's rendering and add the muted-orange logic if it's missing.

## Self-test

Manual test in the running app:

1. Open an existing quote that was cloned from a historical source — confirm any zero-qty "other" lines render as section dividers, not editable rows.
2. Click "Add section heading" — confirm a new divider row appears.
3. Add a manual labour line — confirm Unit shows "hr" by default. Add a part line — confirm "each". Edit the unit on one to "kg" and confirm it persists.
4. Open the similar-quotes drawer for a quote that has historical matches — confirm the job type badge shows a readable name like "Insurance Repair" not a uuid.
5. Go to `/quotes/new`, pick a customer with multiple vans — confirm dropdown shows year and rego.
6. Confirm similar-quotes cards show date as "MMM YYYY", and any card older than 18 months has muted-orange date styling.

## Commit boundaries

1. Section divider rendering + "Add section heading" button
2. Unit column default-by-type rendering
3. `find_similar_quotes` returns canonical name in match_reasons + UI badge update
4. Vehicle dropdown enrichment (year + rego)
5. Issue date prominence + stale-pricing colour
6. Cleanup + self-test + docs/step4a5-summary.md + push

If sensible, group commits 1-2 and 3-5 to keep PR diffs digestible. Use judgement.

## Out of scope (explicit — do not build)

- Backfilling `unit` on existing quote_line_items rows. Display default only.
- Adding a separate `is_section_divider` column or similar schema change. Derive from existing data.
- Drag-and-drop reordering (still up/down arrows).
- Synonym/bigram tuning in similarity (flagged in 4a.1, not addressed here).
- Job history panel for imported customers (waits on jobs unification).
- Vehicle merge admin action for duplicate vans.

## Open questions to flag in plan

- For the section divider rendering, does the existing line items table use a single row component that we adapt, or two separate row components (divider vs regular)? Recommendation: single component with conditional rendering based on the `line_type='other' && qty=0 && unit_cost=0` heuristic. Cleaner.
- Should the "Add section heading" button live next to "Add line item" or be in an overflow menu? Recommendation: alongside, primary visibility — it's a common-enough action.
- For the 18-month staleness threshold, what's "now"? Recommendation: `new Date()` at render time. No need to make this a server concept.

## Wrap-up

Write `docs/step4a5-summary.md` covering:
- Components modified
- Anything that felt awkward to implement (useful signal for backlog)
- Any rough edges for spot-check
- Items remaining from the backlog file
