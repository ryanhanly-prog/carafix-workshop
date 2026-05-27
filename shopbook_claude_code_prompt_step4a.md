# Step 4a — Quote Drafting + Clone-and-Edit + Job-Type Motions

**Context for Claude Code:** This is Shopbook Step 4a. The platform is a multi-tenant workshop ops platform (Carafix is the first tenant). Steps 1-3.6 are complete: auth, schema, jobs/customers/vehicles/parts CRUD, Mechanic Desk import (3 years of data: 14,103 invoices / 41,691 invoice items / 1,288 quotes / 12,844 quote items / 2,847 vehicles / 4,432 jobs / 10,755 timesheets), canonical job-type taxonomy with aliases. The labour corpus is connected (all timesheets join to a job).

This step delivers the core wedge: **James drafts an insurance body repair quote end-to-end in under 45 minutes by cloning a similar past quote and editing it**, with job-type-driven labour rate logic and silent parts-master population. PDF generation and insurer-rate backfill come in Step 4b.

## Goals

1. Create live quote drafting infrastructure (schema + UI + business logic).
2. Implement "Find similar past quotes" panel with Clone button.
3. Implement five job-type motions with editable defaults (Insurance / Jayco Warranty / Private Retail / Internal / Customer-Other).
4. Implement `insurers` table with editable capped labour rates.
5. Silent parts-master population on new line items.
6. Configuration UI for Catherine + James to manage job-type defaults and insurers.
7. Audit log for high-leverage config changes.

## Schema (migration 0020)

### `quotes`
- `id uuid pk`
- `organisation_id uuid not null` (RLS)
- `quote_number text` (auto-generated, e.g. Q-100001, per-tenant)
- `customer_id uuid fk customers`
- `vehicle_id uuid fk vehicles` (nullable; some quotes are pre-vehicle-assignment)
- `canonical_job_type_id uuid fk job_type_canonical not null`
- `insurer_id uuid fk insurers` (nullable; only set if job type uses `insurer_capped` rate source)
- `status text not null` default 'draft' check in ('draft','sent','approved','rejected','converted_to_job','cancelled')
- `description text` (free text — used for similarity matching)
- `damage_tags text[]` (component tags — also used for matching)
- `subtotal_parts numeric default 0`
- `subtotal_labour numeric default 0`
- `subtotal_consumables numeric default 0`
- `subtotal_other numeric default 0`
- `total numeric default 0`
- `cloned_from_quote_id uuid fk quotes` (nullable — references historical quote, can be a `historical_quotes` row OR another live quote)
- `cloned_from_source text` check in ('live','historical') — disambiguates which table `cloned_from_quote_id` points to
- `sent_at timestamptz` (nullable — auto-set when status changes to 'sent')
- `notes text`
- `created_by uuid fk app_users`
- `created_at`, `updated_at`

### `quote_line_items`
- `id uuid pk`
- `organisation_id uuid not null` (RLS, denormalised for query speed)
- `quote_id uuid fk quotes on delete cascade`
- `line_order int not null` (for ordering in UI)
- `line_type text not null` check in ('part','labour','consumable','freight','other')
- `part_id uuid fk parts` (nullable — set for part lines)
- `supplier_id uuid fk suppliers` (nullable)
- `description text not null`
- `quantity numeric default 1`
- `unit text` (e.g. 'each','hr','m','kg')
- `unit_cost numeric default 0`
- `markup_pct numeric default 0`
- `unit_price numeric default 0` (computed: unit_cost × (1 + markup_pct/100))
- `line_total numeric default 0` (computed: unit_price × quantity)
- `source text not null default 'manual'` check in ('manual','cloned','suggested')
- `source_quote_line_id uuid` (if cloned, reference to source line — soft reference, may be live or historical)
- `notes text`
- `created_at`, `updated_at`

### `insurers`
- `id uuid pk`
- `organisation_id uuid not null` (RLS)
- `name text not null`
- `capped_labour_rate numeric not null` (e.g. 95.00 for $95/hr)
- `notes text`
- `is_active bool default true`
- `created_at`, `updated_at`
- unique(organisation_id, name) where is_active = true

Seed for Carafix: leave empty for now (Step 4b backfills from historical invoices). For manual testing, allow Catherine/James to add insurers via UI.

### `job_type_defaults`
- `id uuid pk`
- `organisation_id uuid not null` (RLS)
- `canonical_job_type_id uuid fk job_type_canonical not null`
- `labour_rate_source text not null` check in ('insurer_capped','workshop_retail','jayco_published','cost_only')
- `workshop_retail_rate numeric` (nullable — used when source = 'workshop_retail')
- `markup_floor_pct numeric default 0`
- `markup_default_pct numeric default 0` (used as default for new line items)
- `notes text`
- `created_at`, `updated_at`
- unique(organisation_id, canonical_job_type_id)

Seed for Carafix's 19 canonical types — apply this mapping by `category` field (already populated in `job_type_canonical`):

- `category = 'insurance'` (4 types: Impact / Collision Repair, Insurance Inspection, Insurance Repair, Storm Damage Repair) → `insurer_capped`, markup_floor 40, markup_default 50
- `category = 'service'` (6 types: Annual / 12-Month Service, First Service, Logbook Service, Single Axle Service, Slide Out Service, Tandem Axle Service) → `workshop_retail`, rate 140.91, markup_floor 30, markup_default 40
- `category = 'repair'` (5 types: Awning Repair / Replace, Chassis / Suspension, Electrical Repair, Plumbing / Gas Repair, Water Damage / Leak Repair) → `workshop_retail`, rate 140.91, markup_floor 30, markup_default 40
- `category = 'inspection'` (1 type: Pre-Purchase Inspection) → `workshop_retail`, rate 140.91, markup_floor 30, markup_default 40
- `category = 'upgrade'` (1 type: Upgrade / Installation) → `workshop_retail`, rate 140.91, markup_floor 30, markup_default 40
- `category = 'warranty'` (1 type: Warranty Work) → `workshop_retail`, rate 140.91, markup_floor 0, markup_default 0 — note: if/when Carafix establishes a Jayco-specific warranty workflow, this row gets switched to `jayco_published` via the settings UI; for now, treat all warranty work as workshop-rate
- `category = 'other'` (1 type: Other) → `cost_only`, markup_floor 0, markup_default 0

All 19 types must have a row in `job_type_defaults` after seeding. James/Catherine can edit any of these via the settings UI later.

### `parts` table additions
Add column `auto_created bool default false` to existing parts table. Set to true when a part is created via `silent_save_part()`. Useful later for Catherine to review what's been silently captured.

### Historical quotes — resolved canonical job type
Add a column to `historical_quotes`: `resolved_canonical_job_type_id uuid` (nullable). Backfill via:
1. If historical_quote has a parent job → use that job's canonical_job_type_id
2. Else if there's a resulting historical_invoice with a canonical_job_type_id → use that
3. Else NULL

This is what we'll filter on for "find similar quotes by job type." NULL means we can't filter by job type for that quote — it still appears in similarity results, just with lower priority.

### `config_audit_log`
- `id uuid pk`
- `organisation_id uuid not null` (RLS)
- `entity_type text not null` (e.g. 'insurer', 'job_type_default')
- `entity_id uuid not null`
- `action text not null` check in ('create','update','delete','activate','deactivate')
- `changed_fields jsonb` (before/after for changed fields)
- `changed_by uuid fk app_users`
- `changed_at timestamptz default now()`

Triggers on `insurers` and `job_type_defaults` that insert into this table on every change.

### RLS

Standard pattern via `current_user_org_id()`. All tables read/write only own org. App_users with role 'admin' (both James and Catherine) can read/write everything in their org. No role split needed in v1.

## Business logic

### `find_similar_quotes(p_organisation_id, p_canonical_job_type_id, p_vehicle_make, p_vehicle_model, p_description, p_damage_tags)`

Returns top 5 historical quotes scored by:
- +40 if vehicle_make matches
- +20 if vehicle_model matches
- +30 if resolved_canonical_job_type_id matches
- +N for Jaccard similarity on tokenised description (max 30)
- +M for damage_tags overlap (max 20, proportional to overlap size)

Return: id, source ('historical' or 'live'), score, vehicle, description, line_count, total, created_at. Order by score desc. Filter to organisation_id only.

Also search live `quotes` table the same way, so cloning works for both Shopbook-native quotes and the imported corpus.

### `clone_quote(p_target_quote_id, p_source_quote_id, p_source_type)`

Reads all line items from source (historical_quote_items if source_type='historical', else quote_line_items), inserts them into target quote with:
- source = 'cloned'
- source_quote_line_id = original line id
- All other fields copied as-is (description, qty, unit_cost, markup_pct, unit_price, line_total, line_type)
- Resets line_order to sequential starting at current max + 1

Wrap in transaction. Recompute quote totals at end.

### `silent_save_part(p_organisation_id, p_sku, p_description, p_supplier_id, p_unit_cost)`

If a part with that SKU already exists in org's parts table, return its id. Otherwise insert minimum-viable row (sku, description, supplier_id, unit_cost, is_active=true, auto_created=true) and return new id. Called automatically when a line item with line_type='part' is saved and part_id is null but description+supplier are present.

### `compute_labour_rate(p_quote_id)`

Returns the labour rate to use for new labour lines on this quote, based on:
- Read job_type_defaults for quote's canonical_job_type
- If labour_rate_source = 'insurer_capped' → return insurers.capped_labour_rate (or NULL if no insurer set, with warning)
- If labour_rate_source = 'workshop_retail' → return job_type_defaults.workshop_retail_rate
- If labour_rate_source = 'jayco_published' → return NULL (Jayco-warranty quotes pull rates per-component, not a single rate — flag as out-of-scope for v1, treat as workshop_retail for now and add a "TODO: Jayco rate table" note in UI)
- If labour_rate_source = 'cost_only' → return 0

### Quote total recomputation

Trigger on quote_line_items: any insert/update/delete recomputes the parent quote's subtotals and total. Use a trigger that calls a SQL function `recompute_quote_totals(p_quote_id)`.

### Quote numbering

Per-tenant sequence starting at 100001, format `Q-{number}`. Use a Postgres sequence or a `quote_sequences` table keyed by organisation_id with row-level locking on insert.

### Status side effects

When status changes to 'sent', set `sent_at = now()` automatically (trigger).

## UI screens

### `/quotes` (list)
Standard list pattern matching existing /jobs. Columns: quote_number, customer, vehicle, canonical_job_type, status, total, created_at. Filter chips: status, canonical_job_type, insurer. Search: customer name, quote number, description.

### `/quotes/new`
Form: customer (search + new), vehicle (search + new, filtered to customer's vehicles), canonical_job_type (dropdown from `job_type_canonical`), insurer (dropdown, conditional — only shown if selected job type's labour_rate_source = 'insurer_capped'), description (textarea), damage_tags (chip input).

Submit creates quote in 'draft' status and redirects to `/quotes/[id]/edit`.

### `/quotes/[id]/edit` (the drafting surface — most important screen)

Layout:
- Header: quote number, customer, vehicle, job type, insurer, status. Edit button to change these.
- Left main panel: line items table. Columns: order, description, qty, unit, unit_cost, markup_pct, unit_price, line_total, actions (delete, reorder). Inline editing on all editable columns. "Add line item" button at bottom with line_type selector.
- Right side panel (collapsible): "Find similar past quotes" — shows top 5 from `find_similar_quotes`, each with vehicle, line count, total, and a "Clone all lines" button. Clicking Clone calls `clone_quote()` and refreshes the line items panel.
- Footer: subtotals (parts / labour / consumables / other), total. Status change button (draft → sent → approved → converted_to_job).

When adding a new labour line: unit_cost field defaults to value from `compute_labour_rate()` for this quote. Editable per line.

When adding a new part line: parts master search (autocomplete on description + sku). If user types something not in master, when they save the line `silent_save_part()` fires in the background.

When adding any line: markup_pct defaults to job_type_defaults.markup_default_pct for the quote's job type. Editable per line.

### `/quotes/[id]` (read-only view)
Same layout as /edit but read-only. Used for sent/approved quotes.

### `/settings/job-types` (extend existing screen)
Add a third tab: "Defaults." Table of all canonical job types with editable fields: labour_rate_source (dropdown), workshop_retail_rate (numeric, conditional), markup_floor_pct, markup_default_pct, notes. Save button per row. All changes logged to config_audit_log.

### `/settings/insurers` (new)
List of insurers. Add / edit / deactivate. Fields per insurer: name, capped_labour_rate, notes, is_active. All changes logged to config_audit_log.

### `/settings/audit-log` (new)
Read-only table showing config_audit_log entries. Filter by entity_type, changed_by, date range. Shows: when, who, what changed, before / after values.

## Acceptance test (the demo Ryan + James will run)

1. James logs in, goes to `/quotes/new`.
2. Picks a customer with a Jayco Conquest in their vehicle list.
3. Picks canonical_job_type = **"Impact / Collision Repair"** (category: insurance).
4. Insurer dropdown appears. James picks (or creates) an insurer "RACQ" with capped rate $95.
5. Types a short description: "Front mould impact damage, off-side corner mould affected, decals require replacement."
6. Adds damage_tags: ['front_mould', 'corner_mould_off_side', 'decals'].
7. Submits — lands on `/quotes/[id]/edit` with empty line items.
8. Right panel shows top 5 similar past quotes from the corpus. James picks the closest and clicks Clone.
9. 15-20 line items populate. James reviews.
10. Deletes 2 lines that don't apply. Edits one labour line (bumps hours). Adds one new part line with a SKU that doesn't exist in parts master ("OU-AL-1200x600 — Aluminium panel sheet, 1200x600mm, Coast to Coast, $145"). Saves — verifies in Supabase the part was silently created in parts master with auto_created=true.
11. Totals recompute correctly.
12. Status → 'sent'. Verify sent_at is auto-populated.

End-to-end stopwatch: target under 45 minutes for James's first real one. Even 60 minutes is a win vs his current 2-3 hours.

## Out of scope for Step 4a (explicit — do not build)

- PDF generation (Step 4b)
- Insurer capped-rate backfill from historical invoices (Step 4b — for now manual entry only)
- Embedding-based similarity (keyword + structured fields are sufficient)
- Co-occurrence "did you also need" suggestions
- Labour hours suggestions beyond cloned values
- Markup recommendations beyond `job_type_defaults` static defaults
- Line-splitting UI
- Salvage threshold alerts
- Mobile inspection capture
- Mechanic Desk two-way sync
- Quote → invoice conversion (separate flow, later)

## Tech notes

- Next.js 15 App Router, server components where possible, client components for the line item editor.
- TanStack Query for the live editor (optimistic updates on line item edits).
- shadcn/ui patterns matching existing screens. Sonner for toasts.
- Use existing `current_user_org_id()` for RLS.
- Migration files numbered 0020+. Single migration for all of Step 4a is fine.
- Commit per logical block (schema, business logic, list/new screens, edit screen, settings screens, audit log). Use the prompt's structure as commit boundaries.
- Self-test the demo flow before claiming done. Particularly: clone-and-edit, silent parts save, the recompute trigger, and the sent_at auto-set.

## Decisions already made (don't re-litigate)

- Quote numbering: `Q-100001` sequential per tenant.
- 'sent' status is a flip + auto-captured `sent_at` timestamp. No send method tracking in v1.
- Auto-created parts get `auto_created=true` flag.
- Both James and Catherine have full admin access. No role split in v1.
- All five job-type motions seeded from day one (Insurance / Jayco Warranty / Private Retail / Internal / Customer-Other).
- Body repair canonical type used in the acceptance test: **"Impact / Collision Repair"** (id confirmed present in `job_type_canonical`, category: insurance).

## Wrap-up

After implementation, write `docs/step4a-summary.md` covering:
- Migrations applied
- Tables created
- New routes
- Acceptance test results (with stopwatch time if you self-test it)
- Anything deferred to 4b or later
- Known gaps or rough edges
