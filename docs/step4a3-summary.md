# Step 4a.3 summary — Vans unification

Completed 2026-05-27. Project `uckshjquyupolwwglacm`. `npm run build` passes,
`tsc --noEmit` clean. Self-test: **7/7 pass**. Migrations: **0025, 0026**
(renumbered from the prompt's 0024/0025 — 0024 was already used by Step 4a.2).

## What changed
Imported caravans (`historical_vehicles`) are now mirrored into the live `vans`
table, so the customer detail page and the new-quote vehicle dropdown show real
vehicles instead of "No vans on record".

### Migration 0025 — `vans` schema
Added `external_id`, `chassis_number`, `vin`, `fleet_number`, `vehicle_number`,
`imported_from` (`mechanic_desk`|`manual`, default `manual`), `imported_at`,
`manually_edited` (default false). Partial unique index
`(organisation_id, external_id) where external_id is not null`. Existing rows
marked `imported_from='manual'`, `manually_edited=true`.

### Migration 0026 — backfill + sync function
`sync_imported_vans(p_org)` (SECURITY INVOKER): `INSERT…SELECT` from
`historical_vehicles JOIN customers` (on `customer_external_id = external_id`),
`registration_number → rego`, safe year cast (`year ~ '^\d{4}$' else null`),
`notes` set on insert only; `ON CONFLICT (org, external_id) DO UPDATE … WHERE
vans.manually_edited = false`. The same function backs both the one-time backfill
and the ongoing import (single source of truth).

### Import pipeline + edit tracking
- `run-import.ts` calls `sync_imported_vans` after customers + vehicles are written
  (idempotent refresh on every import).
- `updateVan(vanId, patch)` server action sets `manually_edited = true` on save.
- Customer detail page: **"Vans (N)"** count header + a per-row **edit dialog**
  (make / model / year / rego / notes) — the first way to correct imported van data
  in Shopbook; saving marks the van manually edited.

## Final counts
| | before | after |
|---|---|---|
| live `vans` (Carafix) | 14 | **2,860** (14 manual + 2,846 imported) |
| `historical_vehicles` | 2,847 | 2,847 (unchanged, stays the staging source) |

**Orphan count: 1** — one `historical_vehicles` row whose `customer_external_id`
doesn't resolve to a customer; skipped by the INNER JOIN (expected).

## Self-test (`scripts/test-vans-unify.ts`) — 7/7
- total ≥ 2,860, imported = 2,846; **idempotent** (re-sync leaves count at 2,860);
  `updateVan` flips `manually_edited`; **re-import preserves a manually-edited van
  (QA-EDITED) and refreshes a non-edited one (QA-SRC-CHANGED)**; data restored
  afterward. Customer-detail count/dropdown population are eyeballed by Ryan + James
  in the running app.

## Deferred (out of scope, noted for later)
- **Jobs unification** — `historical_jobs` (4,432 rows, 4,430 resolvable) has the
  same shape but scheduling/status/kanban/dashboard implications; do it as a focused
  later step. Until then the customer "Job history" panel still shows "No jobs yet"
  for imported customers (accurate — no live jobs exist for them).
- Historical invoices/quotes stay as imported staging tables (read directly for
  similarity).
- Quote-editor polish and the job-type-badge-name fix remain bundled for later.

## Known gaps
- A van manually created in Shopbook (`external_id = NULL`) and a later import with a
  matching MD vehicle create **separate** rows by design — they're not "the same"
  van until deliberately merged. A "merge duplicate vans" admin action is a future
  feature.
- `sync_imported_vans` re-runs the full set on each import (set-based, fast at this
  scale); if a tenant's fleet grows very large, scope it to the batch's touched
  external_ids.
