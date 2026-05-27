# Step 3.6 summary — Job-type taxonomy + full historical import

Completed 2026-05-27. Project `uckshjquyupolwwglacm`. `npm run build` passes,
`tsc --noEmit` clean. Migrations: **0018, 0019**. Prep for Step 4 (AI quoting).

## Migrations
- **0018_job_type_taxonomy** — `job_type_canonical` + `job_type_aliases`
  (with `suggested_canonical_id` / `suggestion_confidence`), org-scoped RLS, 19
  seeded canonical types for Carafix (18 + Other), `canonical_job_type(raw)` helper.
- **0019_extended_import_tables** — `historical_vehicles`, `historical_jobs`,
  `historical_timesheets` (org RLS + indexes) + `job_type_canonical_id` back-link
  on `historical_invoices`.

## What got built
- **A** taxonomy schema + seed + helper.
- **B** `/settings/job-types` admin screen (Settings now links to it):
  - Aliases tab — unmapped two-pane with per-row map dropdown (prefilled to the
    suggestion), mapped-by-canonical with Unmap; bulk "Accept all suggestions
    (>70%)" and "Map remaining to Other".
  - Canonical tab — add / rename / recategorise / deactivate via dialog.
  - Server actions, all org-scoped via RLS.
- **C** parsers for Vehicles/Jobs/Timesheets; orchestrator extended to import the
  three new tables, discover job-type aliases (Jaccard word-token similarity,
  suggest-only, never auto-apply), preserve confirmed mappings across imports,
  backfill the canonical back-link, and "warn don't fail" per file.
- **D** ran the full export (one pass ~57s, **0 DB errors**); idempotency pass
  confirmed.
- **E** `/imports` "Latest import" chip; job-types CTA banner.

## Full-import row counts (verified)

| table | rows | prompt estimate |
|-------|------|-----------------|
| customers | 3,513 | 3,504 |
| stock_items | 5,287 | 5,441 |
| suppliers | 181 | 449 |
| historical_invoices | 14,103 | 15,421 |
| historical_invoice_items | 41,691 | 71,623 |
| historical_quotes | 1,288 | 1,814 |
| historical_quote_items | 12,844 | 19,506 |
| historical_vehicles | 2,847 | 2,873 |
| historical_jobs | 4,432 | 7,109 |
| historical_timesheets | 10,755 | 10,804 |

**The counts below the estimates are not data loss.** An independent CSV parser
(PowerShell `Import-Csv`) returned the exact same record counts as the importer
(e.g. Invoice Items = 41,691 by both), so every record in this export was
ingested. The prompt's "prior analysis" estimates were simply high for this
particular export (vehicles and timesheets, which I don't dedupe, matched almost
exactly). Suppliers stayed 181 because Block C scope is Vehicles/Jobs/Timesheets
only — suppliers remain derived from `Stocks.csv`; the export's dedicated
`Suppliers.csv` (which would reach ~449) was intentionally left out of scope.

**Idempotency:** second full pass reported 0 inserted / all updated; row counts
unchanged (timesheets are delete-all + re-insert per org by design, count held at
10,755).

**Joinability:** all 10,755 timesheets join to a `historical_jobs` row by
`job_number` — the labour-hours corpus Step 4 needs is connected.

## Job-type aliases — work waiting for Catherine
- **2,505 distinct raw job-type values discovered, all unmapped.**
- **60** have a confident (>0.5) auto-suggestion pre-filled.
- Top 5 most common unmapped:
  1. `AXLE SERVICE - TANDEM AXLE` ×234 → suggests **Tandem Axle Service** (1.00)
  2. `AXLE SERVICE` ×98 → suggests **Tandem Axle Service** (0.67)
  3. `First Service - Jayco` ×83 → suggests **First Service** (0.67)
  4. `AXLE SERVICE - SINGLE` ×82 → suggests **Single Axle Service** (1.00)
  5. `12MONTH SERVICE` ×37 → no confident suggestion

Mapping the top ~20–50 covers the large majority of occurrences (the long tail is
one-off free-text). Confirmed mappings survive re-imports.

## Judgement calls
- Aliases sourced from Invoices `First Job Type` + Jobs `Job Type` (Quotes.csv has
  no job-type column, despite the prompt mentioning it).
- `occurrence_count` is **set** to the corpus count (not incremented) so re-imports
  stay idempotent.
- Canonical back-link (`historical_invoices/jobs.job_type_canonical_id`) only
  populates from already-confirmed mappings, so it is all-NULL until Catherine maps
  and a re-import runs. Step 4 can also resolve live via `canonical_job_type()` /
  joining `job_type_aliases`, so this isn't blocking.
- Timesheets have no source id → full-replace-per-org for idempotency.
- `canonical_job_type()` helper placed in 0018 (kept migrations to 0018/0019).

## Accepted advisor warnings
Only the pre-existing by-design WARNs: `current_user_org_id()` / `is_controller()`
are SECURITY DEFINER (required for RLS); leaked-password protection is an auth
toggle. No ERROR-level lints; all new tables have RLS.

## Suggested next move
Catherine spends ~15 minutes in **Settings → Job types** mapping the top aliases
(start with "Accept all suggestions (>70%)", then hand-map the high-occurrence
ones) — then **Step 4 (AI-assisted hours-suggester / quoting)** can begin, querying
the canonical groupings against the now-rich historical corpus (invoices, jobs,
timesheets).
