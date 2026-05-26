# Step 3 summary — Multi-tenancy, Import, Catalogue, Polish, Shopbook

Project: `uckshjquyupolwwglacm` (Supabase, ap-southeast-2). Completed 2026-05-27.
`npm run build` passes (Next 16.2.6, Turbopack). `tsc --noEmit` clean.

## 1. Route map

| Route | Renders |
|-------|---------|
| `/` | Dashboard — snapshot strip (Active / In progress / On hold / Urgent / Delayed) + 6 widgets |
| `/login` | Sign-in (Shopbook brand) |
| `/jobs` | Jobs list; supports `?filter=customer_collecting\|in_progress\|urgent\|delayed\|on_hold` with a clearable chip |
| `/jobs/[id]` | Job detail |
| `/customers`, `/customers/[id]` | Customers |
| `/technicians` | Technicians |
| `/parts` | **Parts on order** (outstanding parts) — now tab 1 of the Parts section |
| `/parts/catalogue` | **Catalogue** — paginated stock table, search/filters, detail drawer |
| `/parts/suppliers` | **Suppliers** — rollup, click → filtered catalogue |
| `/imports` | **Imports** — drag-drop Mechanic Desk ZIP upload + history |
| `/schedule`, `/kanban`, `/briefing`, `/settings` | Existing stubs/pages (unchanged) |

Nav: added **Imports** (top-level, before Settings). Parts section uses a shared
nested layout (`src/app/(app)/parts/layout.tsx`) for the tab strip.

## 2. Migrations applied (0012–0016)

| # | Name | What |
|---|------|------|
| 0012 | `import_schema` | 8 import tables (import_batches, suppliers, stock_items, stock_item_suppliers, historical_invoices/_items, historical_quotes/_items) + deny-all RLS placeholders |
| 0013 | `multi_tenancy` | organisations table + TeamRoll/Carafix seed; organisation_id on all business tables (backfill→Carafix, NOT NULL); org-scoped unique keys + indexes; `current_user_org_id()` SECURITY DEFINER; dropped role-gated policies, recreated org-scoped select/insert/update/delete |
| 0014 | `add_external_id_to_customers` | customers.external_id + `(organisation_id, external_id)` unique constraint |
| 0015 | `catalogue_views` | `v_supplier_rollup`, `v_stock_categories` (both `security_invoker`) |
| 0016 | `tenant_aware_triggers` | `log_job_status_change`, `log_promise_date_change`, `sync_primary_task` now propagate the parent job's organisation_id (NOT NULL log/task tables) |

## 3. Tables (public schema, 26)

Business (org-scoped, RLS): `ai_briefings, app_users, bays, customers, holidays,
job_attachments, job_status_log, jobs, locations, parts, promise_date_log, tasks,
technicians, vans`, plus `organisations`, and the import set `import_batches,
suppliers, stock_items, stock_item_suppliers, historical_invoices,
historical_invoice_items, historical_quotes, historical_quote_items`.

Shared reference/config (not org-scoped): `skills`, `app_config`,
`technician_skills` (org-scoped via join to technicians).

Views (`security_invoker`): `v_job_rollup`, `v_skill_daily_demand`,
`v_tech_daily_load`, `v_tech_weekly_utilisation`, `v_supplier_rollup`,
`v_stock_categories`.

## 4. Import self-test (sample ZIPs, Carafix org)

| Entity | Imported | Expected | Notes |
|--------|----------|----------|-------|
| customers | 3,503 new (+10 demo = 3,513 total) | ~3,504 | 1 row skipped (empty name) |
| stock_items | 5,287 | ~5,354 | 67 unique rows skipped (empty name/stock #); keyed on MD UUID |
| suppliers | 181 | ~183 | from semicolon-split Suppliers field |
| stock_item_suppliers | 2,443 links | — | |
| historical_invoices | 41 | ~45 | a few rows lack invoice #/are multiline |
| historical_invoice_items | 123 | ~155 | **correct** logical count — papaparse merges multiline quoted fields; the ~155 estimate was raw line count |
| historical_quotes | 2 | ~2 | |
| historical_quote_items | 12 | ~12 | |

**Idempotency proven:** second pass = 0 inserted, all updated; row counts
unchanged. (Bug found & fixed during the run: paginated existing-key lookups
needed a stable `ORDER BY` or ~900 stock rows were misclassified and links left
incomplete.)

Payment and Credit Notes CSVs are present in the export but have no target tables
in v1 — intentionally ignored.

## 5. RLS policy count per table

Every business + import table: **4** (select/insert/update/delete, all
`organisation_id = current_user_org_id()`). `app_users`: **2** (own profile via
`id = auth.uid()`; org members via the helper — NOT an inline subquery, which
would recurse). `organisations`: **1** (own org). `skills`, `app_config`: **1**
(shared auth-read). `stock_item_suppliers` & `technician_skills`: **4**, scoped
via join to their org-owning parent. RLS enabled on all 26 tables.

## 6. TODO comments left in code

None in `src/`. One documented USER ACTION in `docs/step3-pre-snapshot.md` (take a
Supabase PITR snapshot before Block C) — satisfied this run by the confirmed
2026-05-26 17:44 UTC automatic backup.

## 7. Judgement calls

1. **Stock natural key = `external_id` (MD UUID), not `stock_number`.** The prompt
   (C1) proposed `unique (organisation_id, stock_number)`, but the real export has
   22 blank and ~12 duplicate stock numbers across 5,354 rows — that constraint
   would fail on insert. The UUID is unique and stable, and D4 itself says stock is
   "matched by external_id". stock_number keeps a non-unique index for lookups.
2. **customers uses a full unique constraint `(organisation_id, external_id)`**, not
   the prompt's partial index — PostgREST `.upsert(onConflict)` cannot use a partial
   index as the conflict arbiter. NULLs stay distinct, so the 10 demo customers are
   unaffected.
3. **app_users "org members" policy uses `current_user_org_id()`** (SECURITY DEFINER)
   rather than the prompt's literal `organisation_id in (select ... from app_users)`
   — the inline version triggers Postgres "infinite recursion detected in policy".
4. **`organisations` got RLS** (`id = current_user_org_id()`) — the prompt omitted it;
   left open, any authenticated user could read every org.
5. **`skills`/`app_config` left as shared reference data; `technician_skills` org-scoped
   via join** — not in the prompt's enumerated list but needed deciding.
6. **0016 (tenant-aware triggers)** — not in the prompt, but mandatory: the existing
   triggers insert into now-NOT-NULL `job_status_log`/`promise_date_log`/`tasks`, so
   they had to propagate the job's org or every job write would fail.
7. **5 create actions now resolve+pass `organisation_id`** (new `getCurrentOrgId`
   helper) — the H1-anticipated fallout of NOT NULL org columns.
8. **Nav item kept as "Parts"** (section parent of 3 tabs) rather than renaming the
   nav entry to "Parts on order"; the page heading + first tab carry that label.
9. **Importer uses a loosely-typed Supabase client** for generic multi-table bulk ops
   (the generated types can't express dynamic table names / Record payloads).
10. **Server Action body limit raised to 50mb** so large/multiple export ZIPs upload.
11. **`sample-imports/` gitignored** — contains real customer PII (3.5k records).

## 8. Accepted advisor warnings

- `current_user_org_id()` / `is_controller()` are SECURITY DEFINER and callable via
  RPC (WARN). This is by design — RLS helpers must be DEFINER to avoid app_users
  recursion. anon calls return null; authenticated calls return the caller's own
  org id. Not a leak.
- Leaked-password protection disabled (auth dashboard toggle) — out of scope.

## 9. Suggested Step 4 scope

- **AI-assisted quoting + quote authoring UI** (the historical_quotes/_items and
  stock catalogue now provide the data foundation: price history, COGS, margins).
- **Org switcher / multi-org users + platform-admin vs org-admin role split**
  (multi-tenancy is in place; `is_controller()` retained for the role split).
- **Per-tenant theming** beyond the platform brand (organisations already has
  `logo_url`, `brand_primary_color`).
- **Vehicle catalogue** from imported invoice/quote vehicle data (currently stored
  denormalised on historical rows).
- **Catalogue → job linking**: pick a stock item into a job's parts list, prefilled
  from sell/buy/margin.
- Import polish: surface per-file parse-error details in the `/imports` history;
  support the full (large) MD export; add Payment/Credit Note tables if needed.
