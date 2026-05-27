# Step 4a.6 summary — find_similar_quotes statement-timeout hotfix

Completed 2026-05-27. `npm run build` green, TypeScript clean. One function
migration (`0028`, `CREATE OR REPLACE`, no signature/return change, no types
regen). No app code touched.

## Problem
`find_similar_quotes` was tripping the production statement timeout (the
`authenticated` role's `statement_timeout=8s`), surfacing as a "Could not load
similar quotes" toast on the slide-over panel. Reproduced on **Q-100006**
(LEADER GOLD, Insurance Repair).

Root cause: the `cand` CTE ran **3 correlated subqueries per row** (`line_count`,
`parts_total`, `labour_total`) over **all 1,288 `historical_quotes` + live
quotes** — thousands of subquery invocations per call, each hitting RLS-policied
item tables. Measured **5,595 ms** as the admin role (no RLS); under
`authenticated` + RLS overhead it blew past 8 s and was cancelled.

## Fix (`supabase/migrations/0028_similar_quotes_perf.sql`)
Restructured so the expensive work runs on **only the 5 winners**, not all ~1,300
candidates:

1. **`cand_cheap`** — selects only the columns scoring needs (id, source, make,
   model, tokens, dmg_tags, canon, total, labour_hours, issue_date). **No item
   subqueries.** Historical reads the precomputed/backfilled columns
   (`search_tokens`, `inferred_damage_tags`, `total_labour_hours`); live (only a
   handful of rows) tokenises + sums labour hours inline.
2. **`scored`** — computes `score` + `match_reasons` (cheap array/Jaccard ops).
3. **`top`** — `order by score desc, issue_date desc nulls last limit 5`.
4. **final select** — runs `line_count` / `parts_total` / `labour_total` (per
   source) and `preview_text` only for those 5 rows (~20 subqueries total).
   `total_labour_hours` comes straight from the carried column (historical) /
   inline sum (live); `preview_text` uses `combined_search_text` (historical) or
   `description` (live), looked up per winner.

The **scoring weights and `match_reasons` are byte-for-byte unchanged** (incl. the
4a.5 `job_type:<name>` reason), so ranking and output are identical — this is a
pure performance restructure.

## Self-test (all pass)
- **Timing, Q-100006:** 5,595 ms → **93 ms** (admin); **207 ms** under the exact
  production path (`set local role authenticated` + faked `request.jwt.claims` for
  an org-002 user + RLS + `statement_timeout=8s`) — ~40× under the timeout that
  was cancelling it.
- **Identical output:** the 5 rows for Q-100006 match the pre-fix result
  byte-for-byte — same ids, order, scores (57.94 / 49.00 / 48.00 / 47.25 / 45.00),
  vehicle, preview_text, match_reasons, line_count, totals, labour, issue_date.
- **`job_type:<name>` preserved:** running for Q-100004 (Jayco Starcraft, Storm
  Damage Repair) returns live quote Q-100001 at the top with
  `match_reasons` = `[vehicle_make, vehicle_model, description_match,
  job_type:Storm Damage Repair, recent]`, and its live `total_labour_hours` (15.5)
  + `line_count` (9) computed correctly post-limit.
- **App path:** the panel RPC (`useSimilarQuotes`) is unchanged; it calls the same
  7-arg signature and the toast only fires on RPC error. With the call now
  returning in ~200 ms ≪ 8 s, no error → no toast. Verified at the data layer via
  the authenticated-role simulation above (browser click-through not driven —
  needs a login session).

## Notes
- Already **live in production** — applied to project `uckshjquyupolwwglacm` via
  migration before this commit; the timeout is resolved now.
- `CREATE OR REPLACE` kept the existing `authenticated` grant; the migration
  re-grants it anyway for idempotence.
- No `database.types.ts` regen needed (signature + return shape unchanged).
