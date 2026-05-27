# Step 4a summary — Quote drafting + clone-and-edit + job-type motions

Completed 2026-05-27. Project `uckshjquyupolwwglacm`. `npm run build` passes,
`tsc --noEmit` clean. Acceptance self-test: **15/15 assertions pass**.

## Migrations
- **0020_quotes_schema** — `insurers`, `job_type_defaults` (seeded all 19 canonical
  types by category), `quotes`, `quote_line_items`, `quote_sequences`,
  `config_audit_log`; `stock_items.auto_created`; `historical_quotes.resolved_canonical_job_type_id`;
  org-scoped RLS + `updated_at` triggers.
- **0021_quotes_logic** — functions + triggers (below).

## Tables created
`insurers`, `job_type_defaults`, `quotes`, `quote_line_items`, `quote_sequences`,
`config_audit_log`. Column adds: `stock_items.auto_created`,
`historical_quotes.resolved_canonical_job_type_id`.

## Business logic (SQL functions, all SECURITY INVOKER + rpc-granted)
- `recompute_quote_totals(quote_id)` — driven by **statement-level** triggers on
  `quote_line_items` (transition tables), so a 20-line clone = one recompute.
- `assign_quote_number()` trigger — per-tenant `Q-100001…` via `quote_sequences`.
- `set_quote_sent_at()` trigger — auto-sets `sent_at` on status→`sent`.
- `compute_labour_rate(quote_id)` — insurer-capped / workshop-retail / cost-only
  (jayco_published falls back to workshop rate; TODO Jayco rate table).
- `silent_save_part(org, sku, desc, supplier, cost)` — find-or-create a
  `stock_items` stub (`auto_created=true`, `sell_price`/`markup` left NULL).
- `text_jaccard`, `find_similar_quotes(...)` — scores historical + live quotes
  (+40 make, +20 model, +30 job type, ≤30 description Jaccard, ≤20 damage-tag overlap).
- `clone_quote(target, source, type)` — copies lines from historical or live,
  transactional, recomputes totals.
- `log_config_change()` triggers on `insurers` + `job_type_defaults`.

## New routes
- `/quotes` — list (status / job-type / insurer filters, search).
- `/quotes/new` — customer + vehicle pickers, job type, conditional insurer
  (with inline create), description, damage-tag chips → creates draft.
- `/quotes/[id]/edit` — drafting surface: inline-editable line items, add line
  (labour prefills `compute_labour_rate`, markup prefills job-type default, part
  lines take a SKU for silent save), "Find similar past quotes" + Clone, totals,
  status select.
- `/quotes/[id]` — read-only view.
- `/settings/job-types` → new **Defaults** tab (rate source / workshop rate /
  markup floor+default / notes per type).
- `/settings/insurers` — CRUD + deactivate.
- `/settings/audit-log` — read-only, filterable, per-field before→after diffs.
- "Quotes" added to the main nav; Insurers / Audit log / Job types linked from Settings.

## Acceptance test results (automated self-test, `scripts/test-quote-flow.ts`)
15/15 passed in ~5.3s:
- RACQ insurer created; quote **Q-100001** in draft; `compute_labour_rate` = $95
  (insurer-capped); `find_similar_quotes` returned 5 (top score 140 — exact
  Jayco Conquest + job type + description + damage-tag match); `clone_quote`
  populated 6 lines; line edited + deleted; novel SKU `OU-AL-1200x600` →
  `stock_items` stub with `auto_created=true` and non-curated pricing; quote total
  recomputed by trigger (5823.80 = Σ line totals); `sent_at` auto-set on `sent`.
- Self-test cleans up its quote/customer/van/stub (leaves RACQ for the live demo);
  the audit log captured the RACQ create. Quote sequence reset to 100000 so the
  first **real** quote is Q-100001.
- The live-demo stopwatch (James's first real quote, target <45 min) is for the
  manual run; the automated flow proves the plumbing end-to-end.

## Deferred to Step 4b (and beyond)
- PDF generation; insurer capped-rate backfill from historical invoices (manual
  entry only for now); embedding-based similarity; co-occurrence suggestions;
  labour-hours suggestions beyond cloned values; markup recommendations; line
  splitting; salvage alerts; mobile capture; MD two-way sync; quote→invoice.

## Known gaps / rough edges
- **`historical_quotes.resolved_canonical_job_type_id` is all NULL** — that table
  has no reliable FK to jobs/invoices in this data, so historical rows don't get
  the +30 job-type score (make/model/description still drive matching). Backfilling
  it is a 4b candidate if a join key is established.
- **Vehicle FK is strict to `vans`** (live registry). Imported caravans live in
  `historical_vehicles` and aren't selectable; James creates the van inline (which
  is the normal flow for a new job anyway).
- **Cloning historical lines** infers `line_type` (labour by keyword, else
  part/other) and sets `markup_pct=0`, preserving the historical unit price.
- **Editing** saves on blur and refetches (invalidate-on-mutation) rather than
  fully optimistic; totals always reflect the server trigger.
- **Reorder** is up/down swap (no drag-and-drop).
- `find_similar_quotes` returns the current quote itself for live rows; the editor
  filters it out client-side (the rpc signature was kept exactly as specified).
- `jayco_published` rate source currently falls back to the workshop rate.
