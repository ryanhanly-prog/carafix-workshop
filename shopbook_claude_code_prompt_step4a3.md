# Step 4a.3 — Vans Unification

**Context for Claude Code:** During real-data testing, two related UX bugs surfaced:

1. The customer detail page (`/customers/[id]`) shows "No vans on record" for customers who do have imported caravans, because the page reads only from the live `vans` table.
2. The new quote vehicle dropdown (`/quotes/new`) shows "No vans for this customer yet" for the same reason — forcing James to manually re-type vans that already exist in the database.

Root cause: 2,847 imported caravans live in `historical_vehicles`, never copied into `vans`. The UI was written to read from `vans` (the correct long-term home) but the data migration never bridged the two tables.

Verified via Supabase MCP:
- 2,847 rows in `historical_vehicles`
- **2,846 of them join cleanly to the live `customers` table** via `customer_external_id → customers.external_id` (one orphan, ignore it)
- 13 rows in live `vans` (only the ones manually created in Shopbook during testing)
- 3,516 customers total

This step unifies historical_vehicles into vans, fixes the import pipeline so future imports stay in sync, and adds a small "N vans on record" count display on the customer detail page for clarity.

## Goals

1. Migrate 2,846 resolvable historical vehicles into the live `vans` table.
2. Update the MD import pipeline to upsert into `vans` going forward (idempotent, preserves manually-edited rows).
3. Display the van count on the customer detail page header.

## Migration 0024 — schema additions to `vans`

Add these columns:
- `external_id text` (nullable, used for imported rows)
- `chassis_number text` (nullable)
- `vin text` (nullable)
- `fleet_number text` (nullable)
- `vehicle_number text` (nullable)
- `imported_from text check (imported_from in ('mechanic_desk','manual')) default 'manual'`
- `imported_at timestamptz` (nullable — set only for imported rows)
- `manually_edited bool default false` (true once a user has edited an imported row; protects from being overwritten on re-import)

Add a unique index: `unique (organisation_id, external_id) where external_id is not null`.

Regenerate `database.types.ts` after.

Commit 1.

## Migration 0025 — backfill from historical_vehicles

For each row in `historical_vehicles` where `customer_external_id` resolves to a `customers` row:

INSERT INTO vans with this mapping:
- `organisation_id` → `organisation_id`
- `customer_id` → `customers.id` (joined via `customer_external_id → customers.external_id`)
- `make`, `model`, `year`, `notes` → as-is
- `registration_number` → `rego`
- `chassis_number`, `vin`, `fleet_number`, `vehicle_number` → as-is
- `external_id` → `historical_vehicles.external_id`
- `imported_from` → `'mechanic_desk'`
- `imported_at` → `historical_vehicles.imported_at`
- `manually_edited` → `false`

Use `ON CONFLICT (organisation_id, external_id) WHERE external_id IS NOT NULL DO NOTHING` so re-runs are safe. The migration is idempotent.

Log the orphan count (rows where customer_external_id doesn't resolve — should be 1).

Commit 2.

## Update import pipeline

When MD imports run and write to `historical_vehicles`, ALSO upsert into `vans` using the same mapping above.

The upsert logic:
- `ON CONFLICT (organisation_id, external_id) WHERE external_id IS NOT NULL DO UPDATE`
- BUT only update fields if `manually_edited = false` on the existing row
- Specifically: `SET make = EXCLUDED.make, model = EXCLUDED.model, year = EXCLUDED.year, rego = EXCLUDED.registration_number, chassis_number = EXCLUDED.chassis_number, vin = EXCLUDED.vin, fleet_number = EXCLUDED.fleet_number, vehicle_number = EXCLUDED.vehicle_number, imported_at = EXCLUDED.imported_at WHERE vans.manually_edited = false`

This means re-running an import refreshes imported data, but if James has manually corrected a make/model/rego in Shopbook, that correction is preserved.

When a user edits a van in the Shopbook UI, set `manually_edited = true` on save (server action update). Add this to whatever existing van edit endpoint already exists.

Commit 3.

## UI: customer detail page

On `/customers/[id]`, in the Vans section header, change "Vans" to "Vans (N)" where N is the count of vans for this customer.

When N = 0, the empty state already says "No vans on record" — keep that.

Commit 4.

## Self-test

Run via Supabase MCP after deployment:

1. Verify vans count grew from 13 to ~2,860 (13 original + 2,846 imported).
2. Pick 3 customers at random who had historical vehicles in the pre-state; confirm `/customers/[id]` now shows their vans with the count in the header.
3. Create a new quote for one of those customers (`/quotes/new` → select customer → vehicle dropdown should populate with their vans).
4. Edit a van's make/model in the UI; verify `manually_edited` flips to true.
5. Run the backfill again (idempotency test); verify counts unchanged.
6. (Optional) Simulate a re-import of one historical_vehicle row with a different make; verify a non-edited van updates, an edited van does not.

## Commit boundaries summary

1. Migration 0024 (schema)
2. Migration 0025 (backfill) + run + log orphan count
3. Import pipeline upsert + manually_edited tracking on edit
4. Customer detail page van count display
5. Self-test + docs/step4a3-summary.md + final build/push

## Out of scope (explicit — do not build)

- **Jobs unification.** The same pattern exists for historical_jobs (4,432 rows, 4,430 resolvable) but jobs has scheduling/status/kanban/dashboard implications that are different from vehicles. Defer to a focused later step.
- **Historical invoices/quotes unification.** Same logic — keep them as imported staging tables, the UI reads from them directly for similarity matching.
- **Customer Job History panel fix.** Will still show "No jobs yet" for imported customers — that's accurate, since no live jobs exist for them. Fixed properly when we tackle jobs unification.
- **Quote editor sidebar collapse / totals panel restructure.** Polish, separate concern.
- **Job type badge showing id instead of name** (flagged in 4a.1 summary). Five-minute fix, but a different file. Bundle later.

## Open questions to flag in plan

- If a customer manually creates a van in Shopbook and later an import arrives with a matching external_id, what should happen? (Recommendation: the manual van has external_id=NULL, so the unique index doesn't conflict; the import would create a separate row. This is correct — they're not the "same" van until someone deliberately merges them. Future feature: a "merge duplicate vans" admin action.)
- For the existing 13 manually-created vans, should `manually_edited` default to `true` since they were manually entered? (Recommendation: yes — set explicitly during the migration.)
- Should the migration also backfill anything onto `historical_vehicles` to indicate "this is now mirrored in vans"? (Recommendation: no — historical_vehicles stays as a pure staging/source-of-truth table. The relationship is implicit via external_id.)

## Wrap-up

Write `docs/step4a3-summary.md` covering:
- Pre/post vans count
- Orphan count
- Idempotency verified
- Anything noted for later (jobs unification, etc.)
- Known gaps
