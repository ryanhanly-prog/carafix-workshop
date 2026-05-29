# Shopbook 4d — Phase 2: Layer 2 Stats & Signals — Plan & Brief
*Phase 2 of Step 4d. The intelligence layer. Built on the merged Phase 1 Layer 1 rollup, and grounded in the Phase 2 investigation findings (run 29 May 2026), NOT on the original plan's assumptions where they differ.*

## How this phase runs (process)
Plan-first, same ritual as Phase 1:
1. Read this brief, `4d_plan.md` (sections 3, 4 Layer 2, 7), and the Phase 2 investigation memory.
2. Inspect the live schema via MCP to confirm real column names / join keys for the tables this phase touches.
3. Produce a concrete **build plan** for review: exact tables/columns with real source columns, how each stat is computed, the tier logic, the filtering logic, and the validation queries.
4. **STOP and wait for human approval of that plan.** Do not write the migration until approved.
Then build, self-test via MCP, open a PR, STOP for the numbers review. Do not merge.

## Context
- Repo `carafix-workshop`, Supabase project `uckshjquyupolwwglacm`, org Carafix = `00000000-0000-0000-0000-000000000002`.
- Phases 0 + 1 merged. Layer 1 = `historical_job_rollup` (one row per typed job, 2,128 rows) + `historical_job_rollup_lines` (one row per invoice item, 11,271 rows, with `bucket` = labour/parts/unclassified/rounding). Per-line granularity (SKU, category, description, qty, unit_cost, unit_sell, bucket) is preserved.
- 4c's `sku_price_stats` exists and is extended here.
- Founding principle: aggressive capability, conservative authorship, trust-earned escalation. James is the author; the system is the fastest typist alive. The system must KNOW WHEN IT DOESN'T KNOW and fall back to the retained Similar-Quotes panel rather than emit confident garbage.

## What Phase 2 is
Build the Layer 2 stats/signals layer — the "what a job of type X usually involves" intelligence — refreshed by `refresh_job_type_stats(p_org)`. This is the overlay fuel: it annotates a retrieved draft with frequency ("usual"), labour ranges, cross-sell signals, recency-weighted pricing, and — critically — CONFIDENCE, so the engine downstream knows when to trust stats vs lean on retrieval vs fall back to the panel.

## Evidence that shapes this phase (from the Phase 2 investigation — do not re-derive, design to these facts)

**Finding 1 — Quote↔invoice pairing is thin.** Only 354 clean 1:1 quote↔invoice pairs exist; per-type only Insurance Inspection (109) and Awning (51) are stat-grade. Per-(type × SKU) deltas are NOT viable on this data.
→ **Cross-sell / under-quote-correction signals are computed at POPULATION level** (type-wide quote-frequency vs type-wide invoice-frequency, as separate populations), NOT per-job-paired. The per-job version ("on jobs like this one you also added X") is DEFERRED to the flywheel (v2), unlocked as live paired data accumulates.

**Finding 2 — The variance thesis is a precise three-tier map.** Each common type falls into:
- **SKU-stat-viable** (<25% unclassified $, parts-dominant): logbook_service, single_axle_service, first_service, tandem_axle_service, upgrade_install. Per-SKU frequency/qty stats work directly; aggregation is most of the draft.
- **Retrieval-led with stat overlay** (25–40% unclassified $): water_damage, electrical_repair, awning_repair, annual_service, storm_damage. Retrieval clones the skeleton; stats annotate only the parts portion.
- **Retrieval-only** (≥50% unclassified $): insurance_inspection (59%, and the HIGHEST-volume type at 438 jobs / $1.34M), warranty_work (50%). Per-SKU stats are noise; suppress "usual SKU" annotations entirely; retrieval is the only path.
→ **`job_type_part_signals` (and/or a per-type table) carries a `stats_reliability` tier** so the engine knows whether to surface "usual SKU" annotations at all for a given type.

**Finding 3 — Pricing depth.** 84% of common-type dollar-value comes from SKUs with ≥3 sales in trailing 12 months. Long tail (19% of SKUs) is only 2% of dollars.
→ **Tiered recency pricing: `recent_rich` (≥3 in 12mo) → `recent_thin` (1–2 in 12mo) → `alltime` (0 in 12mo, has history) → `unknown`.** Each priced line carries its tier as a confidence badge. No silent stale pricing.

**Finding 4 — No seed/template flag exists.** `historical_quotes.status` is all real-realized; live `quotes` has no `is_template`/`origin`/`kind`; `quote_line_items.source` is line-level clone provenance only.
→ **Introduce a quote `kind` distinction (e.g. enum `realized` | `template` | `live_committed`) + a `realized_at` timestamp, and make EVERY Layer 2 stats function filter on it from day one.** Pricing & frequency stats use only real data (`realized` + later `live_committed`); retrieval may additionally see `template`. This is the flywheel foundation. SCOPE: add the flag + wire the filtering ONLY. Do NOT build the "James authors a template quote" UI/path now — that is a deferred app-layer feature. The flag must exist now so stats are correct from day one and never retrofitted.

**Finding 5 — The matcher is quote-native; the rollup has no search infrastructure.** `find_similar_quotes` is well-built (job-type +30, make +25/model +15, damage-tag overlap +40, description Jaccard +60, recency +5) but retrieves over quotes only. `historical_job_rollup` has no `search_tokens` / `combined_search_text` / `inferred_damage_tags`.
→ **Phase 2 enriches the rollup with `combined_search_text` + `search_tokens` (+ `inferred_damage_tags` if cleanly derivable) + a GIN index**, derived from rollup_lines descriptions + job description + invoice description, reusing the existing tokenizer. This sets up Phase 3's job-native retrieval. (Decision: search-text enrichment lands in Phase 2; the matcher rewrite stays Phase 3.)

## Tables to build/extend (subject to schema confirmation)
1. **`job_type_scope_stats`** — per (type × SKU) AND per (type × category): frequency %, median qty, sample size. Category-level rows ensure unclassified/no-SKU value does not vanish. Carries sample sizes as first-class columns.
2. **`job_type_labour_stats`** — per type: median hours + p25/p75 + sample size + reliability flag (low for insurance / logbook / first_service per the noisy-data note).
3. **`job_type_part_signals`** — per type: the `stats_reliability` tier (Finding 2); and population-level cross-sell/correction signals (Finding 1) — type-wide quote-freq vs invoice-freq per SKU/category, classified {correction | cross_sell | noise} with a noise denylist (ROUNDING etc.).
4. **Extend `sku_price_stats`** with the tiered recency pricing (Finding 3).
5. **`draft_excluded_skus`** — small denylist config (ROUNDING etc.).
6. **Rollup search enrichment** (Finding 5) — `combined_search_text`/`search_tokens`/`inferred_damage_tags` + GIN index on the rollup.
7. **Quote `kind` + `realized_at`** (Finding 4) — flag + stats filtering only.

All tables org-scoped; all refreshed by `refresh_job_type_stats(p_org)` (and the rollup-enrichment by the existing/extended rollup refresh as appropriate); idempotent; built to admit live data later (the flywheel).

## Confidence is first-class (resolves graceful degradation)
Every stat that feeds the engine must store the signals the engine reads to decide trust vs fallback:
- per-type sample size; per-(type × SKU) sample size; per-type unclassified-share; per-SKU price tier.
- The engine (Phase 4) uses these to: show SKU annotations only for SKU-viable types; show pricing confidence badges; and **fall back to the retained Similar-Quotes panel when confidence is below a floor.** The panel is the honest "I don't have a strong draft — here are the closest real jobs" path. Low confidence is a graceful fallback, never a confident-wrong draft.

## Frequency semantics (a deliberate design choice)
Store RAW frequencies/counts in Layer 2; do NOT bake "usual/rare" thresholds into the stats tables. Thresholds are presentation-layer and should be tunable and variance-aware (a 60%-frequency item means something different in a tight type vs a sprawling one). This keeps James able to influence "what counts as usual" once he sees it, without a schema change.

## Validation gate (must appear in the PR description with real results)
1. Row counts and per-type coverage for each new stats table.
2. **Spot-check the tier classification** against Finding 2 (the three tiers must come out as expected: insurance_inspection retrieval-only, tandem SKU-viable, etc.).
3. **Pricing tier distribution** matches Finding 3 (~84% of $ in recent_rich).
4. **Confirm stats filter correctly on `kind`** — a synthetic `template` row must NOT move pricing/frequency stats (prove the filter works before any real template data exists).
5. Composition pull for the top ~8 types: the "usual lines + hours + cross-sells" the engine would surface — **this is what James/Cath eyeball at the gate.**
6. Idempotency: re-run `refresh_job_type_stats`, confirm checksums unchanged.

## THE GATE (the big one — the real go/no-go for the whole feature)
After validation passes, pull the generated composition (usual parts/categories + labour range + population cross-sells + pricing) for the top ~8 types and **James + Cath eyeball: "is this the usual job?"** This is human judgement, not arithmetic — there is no raw ground truth for "usual." If the compositions look like jobs James recognises, Phase 2 is a go and the feature is real. If they look thin/wrong on the types that matter, we stop and rethink before Phase 3. Insurance Inspection and Water Damage are the must-review types (highest volume / hardest variance).

## Output / workflow
Plan approved by human first → migration on branch `step-4d-phase2-stats-signals` → self-test all validation via MCP → PR opened (gh from PowerShell) → STOP for numbers review → James/Cath gate → merge only on go.

## Explicitly NOT in Phase 2 (deliberate)
- No per-job-paired delta features (population-level only; per-job deferred to flywheel).
- No "James authors a template quote" UI/path (flag + filtering only).
- No matcher rewrite (that's Phase 3; Phase 2 only enriches the rollup with search infrastructure).
- No engine / get_draft_for_job (Phase 4).
- No UI (Phase 5).
- No embeddings (later upgrade).
