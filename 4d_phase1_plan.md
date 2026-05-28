# Shopbook 4d — Phase 1: Layer 1 Job Rollup — Plan & Brief
*Phase 1 of Step 4d. Reads from the merged Phase 0 backfill. Data engineering only — no UI, no app code.*

## How this phase runs (process)
This is a **plan-first** phase. Claude Code's first job is NOT to build. It is to:
1. Read this brief and the relevant sections of `4d_plan.md` (sections 3, 4 Layer 1, 7, 8).
2. **Inspect the actual live schema via MCP** — real table names, real column names, real join keys — and report what it found.
3. Produce a concrete **build plan** for review: exactly what table it will create, what columns (with their real source columns), how it will roll up each grain, how it will handle edge cases, and the validation queries it will run.
4. **Stop and wait for human approval of that plan.** Do not write the migration until the plan is approved.

Only after the plan is approved does Claude Code build, self-test via MCP, open a PR, and stop again for the numbers review.

## Context
- Repo `carafix-workshop`, Supabase project `uckshjquyupolwwglacm`, org Carafix = `00000000-0000-0000-0000-000000000002`.
- Phase 0 is merged (migration 0031): `job_type_canonical_id` is backfilled on `historical_jobs` (2,128 typed, ~48%) and `historical_invoices` (1,343 typed). Idempotency proven.
- Phase 0.5 was investigated and deliberately skipped (tail is free-text singletons, low ROI).
- Open domain question (NOT resolved, do not act on it): whether to add an "Inspection / Quoting" 20th canonical. Phase 1 proceeds on the existing 2,128 typed jobs regardless; if that canonical is added later, the rollup is simply re-refreshed.

## What Phase 1 is
Build **Layer 1: `historical_job_rollup`** — one clean, query-ready row per historical job — plus a refresh function `refresh_job_rollup(p_org)` that (re)populates it. This collapses the four data grains (jobs / invoices / invoice items / timesheets) into a single canonical row so that Layer 2 (stats), Layer 3 (retrieval), and the engine all read whole jobs from one place instead of re-joining four tables every time.

## Why
The corpus is spread across four grains joined on `job_number` (and items→invoices via `invoice_id`). Grouping and matching on whole jobs — which everything downstream needs — is awkward and error-prone against raw grains. Layer 1 is the spine that makes the rest tractable.

## Target shape (one row per job — confirm against real schema)
Each `historical_job_rollup` row should carry, subject to what the real schema actually supports:
- **Identity:** `job_number`, `organisation_id`, canonical job type (`job_type_canonical_id` from Phase 0).
- **Van:** make / model / year — from wherever van data actually lives (inspect; do not assume column names).
- **Customer:** customer reference / external id.
- **Hours:** rolled-up charged hours from `historical_timesheets` — sum of `charged_hours`, **excluding `is_internal_no_charge`**. This is the ONLY hours source.
- **Parts / line items:** rolled up from invoice items (joined via `invoice_id`) — enough to support Layer 2 scope/pricing later (SKU, category, qty, sell, cost as available).
- **Totals:** parts total, labour total, job total — as actually stored or cleanly derivable.
- **Provenance / reconciliation counts:** number of invoices, timesheets, and items contributing to the row, so correctness can be checked.

## Scope & constraints
- **Inspect schema first, assume nothing.** Confirm real column names, join keys, and how van / customer / totals are stored before designing. Surface anything that doesn't match the plan's assumptions and STOP for a decision rather than working around it silently.
- **v1 includes only jobs with a resolved `job_type_canonical_id`** (the 2,128). Untyped jobs are out of scope this phase.
- Follow the established 4c pattern (`sku_price_stats`) and migration conventions — continue numbering at **0032+**. Precompute table + `refresh_job_rollup(p_org)` refresh function.
- **Org-scoped** (function takes `p_org`). **Idempotent** — safe to re-run (truncate-org-and-rebuild or upsert; must be re-runnable to the same result).
- **No destructive ops on raw `historical_*` tables** — they stay immutable.
- Design the table so live jobs can be admitted later (the flywheel) — but do not build that now.

## Validation gate (must appear in the PR description with real results)
1. **Row count** of `historical_job_rollup` after refresh — expect ~2,128 (one per typed job). Explain any difference.
2. **10-job reconciliation (the heart of the gate):** for 10 specific `job_number`s, prove the rollup's charged-hours, parts, and totals match the same figures computed directly from the raw grains. The rollup must be *provably correct*, not merely plausible.
3. **Idempotency:** re-run `refresh_job_rollup`, confirm row count and a sample/checksum are unchanged.
4. **Sanity aggregates:** jobs-per-canonical-type in the rollup should mirror Phase 0's top-20; null-rate check on van make/model and hours.

## Output / workflow
- Plan reviewed and approved by human FIRST (see process above).
- Then: migration on branch `step-4d-phase1-job-rollup`, pushed, PR opened (gh works from PowerShell; use full path if bash can't find it).
- Self-test all validation via MCP before handing back.
- **Do not merge** — stop and show the row count, the 10-job reconciliation, and the sanity aggregates for review.

## Founding principle (carried forward)
Aggressive capability, conservative authorship, trust-earned escalation. Prove correctness before building on it; surface schema surprises rather than guessing; the human approves the plan and reviews the numbers at each gate.
