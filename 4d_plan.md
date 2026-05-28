# Shopbook 4d — Smart Draft Assembly: Build Plan
*Planned 28 May 2026. Validated against the live Carafix corpus, not assumptions.*

## 1. What 4d is (one paragraph)
James picks a job type + van (+ optional description). The engine retrieves the most similar real past job and pre-fills a draft from its actual lines — coherent, and defensible as his own history ("based on the Henderson job, March, same Silverline"). An intelligence overlay then annotates that draft: confirms which lines are usual, flags usually-present items that are missing (under-quote correction), suggests "customers often also add…" (cross-sell), prices every line at Carafix's typical recent sell/markup, and shows a job-level gross-profit traffic-light against KPIs. Nothing enters his live quote until he previews and commits. How hard the engine leans on aggregation vs a single retrieved job is gated by each type's measured variance. Insurance labour is never auto-predicted.

## 2. Founding principle
Aggressive capability, conservative authorship, trust-earned escalation. Push the intelligence hard, but every output is framed as James's own memory recalled, never as the system deciding. He is always the author; the system is the fastest typist alive.

## 3. The data model (final — this is the spine of everything)
- Scope (which lines belong) ← historical quotes (the clean initial estimate; avoids invoice supplementary-scope inflation).
- Pricing (sell/cost/markup) ← historical invoices + live, recency-weighted (trailing ~12 months, all-time fallback). Realized actuals, not stale 3-year blends.
- Hours ← historical timesheets (the only source; charged_hours, excluding is_internal_no_charge).
- Quote→invoice delta, per (job type, SKU), measured at population level ← a first-class derived signal that drives two features: under-quote corrections (invoice-only in-category parts → nudge into base) and cross-sells (invoice-only parts that are core to a different job type → optional "often also added"). A noise denylist removes artifacts (ROUNDING, etc.).

## 4. Architecture — three derived layers + one engine
**Layer 0 — Raw (immutable).** historical_* as imported. Never edited, never quoted from. Enables clean re-derivation.

**Layer 1 — historical_job_rollup.** One clean row per historical job: backfilled canonical job type, van make/model/year, customer, rolled-up charged hours, parts, totals. Collapses the four grains (jobs/invoices/items/timesheets) joined on job_number (and items→invoices on invoice_id). Refresh: refresh_job_rollup(p_org).

**Layer 2 — Stats & signals** (org-scoped, refreshed by refresh_job_type_stats(p_org)):
- job_type_scope_stats — per (type × SKU/category): frequency in quotes, median qty, sample size, variance/CV flag.
- job_type_labour_stats — per type: median + p25/p75 charged hours, sample, reliability flag (low for insurance/logbook/first-service).
- job_type_part_signals — per (type × SKU): quote-freq, invoice-freq, delta, classification {correction | cross_sell | noise}.
- Extend existing sku_price_stats (from 4c) with recency-weighting.
- draft_excluded_skus — small denylist config (ROUNDING, etc.).

**Layer 3 — Retrieval.** Reuse/extend the existing "Similar past quotes" matcher (already quote-native via inferred_damage_tags, combined_search_text, search_tokens). For 4d it ranks Layer-1 jobs by job-type + van make/model + description similarity. Van-awareness lives here (a matching weight), not as a stats slice. Function: match_similar_jobs(p_org, p_job_type_id, p_van_make, p_van_model, p_description, p_limit). Embeddings are a later upgrade, not v1.

**Engine — get_draft_for_job(p_org, p_job_type_id, p_van_id, p_description):**
1. Read the type's variance/confidence from Layer 2.
2. Retrieve top-K similar real jobs (Layer 3); seed the draft from the best match's actual lines (coherent skeleton).
3. Overlay from Layer 2: tag each line with its "usual" frequency; compute missing-usual-core (corrections); attach cross-sell suggestions; price each line recency-weighted; guard to live-catalogue SKUs only; compute line margins, job GP%, traffic-light vs KPIs (70% job / 30% parts; floors from job_type_defaults).
4. Labour: median + range where reliable; insurance labour left blank for James.
5. Return draft + provenance ("based on job #X") + confidence badge.

## 5. The interaction model (Cath's contribution — load-bearing)
**Retrieve → Preview → Commit/Adjust.**
- The Similar-quotes panel is retained and promoted, not replaced — James can always browse ranked matches and choose, never locked into the auto-pick.
- Preview-before-commit: both panel-clone and 4d-draft show what would land — lines, totals, margin light, and the overlay intelligence (corrections, cross-sells, frequency, hours range) — before anything enters the live quote. This is the home where 4d's smarts are seen, and it makes authorship a UI step.
- Everything editable; show consequence, not enforcement. When James caps a markup, he watches the job GP% move and lifts hours to compensate — the tool shows the maths, he makes the call.

## 6. Build sequence (each phase has a hard validation gate; data engineering proven before any UI)
- **Phase 0 — Backfill canonical job type** on historical_jobs and historical_quotes (and historical_invoices via spine) from job_type_aliases. Gate: coverage per common type; spot-check ~10 mappings with James/Cath. Low-risk, reversible, idempotent migration.
- **Phase 0.5 — Coverage lift** (optional, high-value): also resolve type from invoice first_job_type and timesheet job_title/job_description; fuzzy/LLM-classify stubborn raw strings. Gate: common types ≥ ~80% typed.
- **Phase 1 — Layer 1 rollup** + refresh_job_rollup. Gate: counts and rollups reconcile on 10 sampled jobs.
- **Phase 2 — Layer 2 stats/signals** + recency pricing + denylist. Gate (the big one): pull composition + hours + cross-sells for the top ~8 types; James/Cath eyeball "is this the usual job?" Go/no-go.
- **Phase 3 — Retrieval matcher.** Gate: ~10 new-job scenarios return sensible matches (right type, similar van/damage).
- **Phase 4 — Engine get_draft_for_job.** Gate: Tandem Axle + Water Damage output looks like a quote James would recognise.
- **Phase 5 — UI** (the retrieve→preview→commit flow, panel retained, draft pre-fill, margin traffic-light, overlay, authorship framing, granular grouped job-type picker). PR flow, James-tested.

## 7. Key verified facts (so tomorrow doesn't re-investigate)
- Spine: job_number joins jobs↔invoices↔timesheets; items↔invoices via invoice_id.
- Counts: jobs 4,432 (type 0% populated, raw 61%); invoices 14,103 (type 0%, only 3,203 carry job_number); items 41,691 (74% SKU, 100% category, 21 categories); timesheets 10,755 (100% link to jobs); quotes ~1,000+ typed (retrieval-native); quote_items carry stock_number.
- Backfill from alias map → ~2,128 jobs typed (~48%); common types richly covered (Tandem 285, Insurance Inspection 438, Water Damage 237, Electrical 187, Awning 168, First Service 138, Annual 105…).
- Variance (CV of parts): 0.37 (Impact) → 1.39 (Upgrade); all moderate-high ⇒ retrieval-led, not pure templates.
- Scope creep: insurance quote→invoice ~doubles (8.8→16.9); services/retail ≈ equal.
- Pricing drift: AXL SERV +11% over 3yr ⇒ recency-weight.
- Supersession: 98% of frequent SKUs still in live catalogue ⇒ cheap guard.
- Van-specificity: Ford vs AL-KO seal never co-occur (121/53/0) ⇒ van = retrieval weight.
- Delta example (Water Damage): ROUNDING +21 (noise), AXL SERV +13 (cross-sell), repair materials ≈0.
- job_type_defaults (19 rows) already holds markup_floor_pct/markup_default_pct/workshop_retail_rate ⇒ KPI scaffolding exists.

## 8. Constraints & conventions
Multi-tenant: every table org-scoped, every refresh fn takes p_org. Precompute + refresh-function pattern (consistent with 4c sku_price_stats, migrations 0029/0030 → continue at 0031+). All changes via PR (branch protection). /clear between phase prompts. Identity at SKU+category for v1; description normalization of the no-SKU tail is later. Exclude/flag First Service (unreliable data). Design refreshes to admit live quotes/invoices later (the flywheel).

## 9. Deferred but shaping the schema now
Supplementary quotes (design quote schema for parent/child from the start). Quotes dashboard (approval pipeline). Mechanic Desk hand-off (the no-double-handling adoption gate — separate track, ultimate test).

## 10. Phase 0 prompt — ready to paste into Claude Code tomorrow
> **/clear before sending.**
>
> **Context.** Shopbook (workshop quoting platform), repo carafix-workshop, Supabase project uckshjquyupolwwglacm, org Carafix = 00000000-0000-0000-0000-000000000002. We're starting Step 4d (Smart Draft Assembly). This is Phase 0: backfill canonical job type onto the historical corpus — the prerequisite for everything. Pure data prep. No UI, no app code.
>
> **Why.** 4d learns "what a job of type X usually involves" from history. Today job_type_canonical_id is 0% populated on historical_jobs and historical_invoices, even though the raw text and the alias map both exist. Without this, the engine has nothing to group by.
>
> **Objective.** Write one idempotent, reversible migration (next number after 0030) that populates job_type_canonical_id on historical_jobs and historical_invoices, resolving from each table's raw job-type text via job_type_aliases. Also confirm/extend canonical typing on historical_quotes (it uses resolved_canonical_job_type_id, ~58% populated) by resolving any unresolved rows the same way.
>
> **Resolution logic (exact).** For each target row with a non-empty raw type, match lower(btrim(raw_text)) = lower(btrim(job_type_aliases.raw_value)) for the same org where job_type_aliases.canonical_id IS NOT NULL, and set the canonical id. Raw columns: historical_jobs.job_type_raw, historical_invoices.first_job_type, historical_quotes already has a raw source if present. Only update rows where the canonical id is currently NULL (idempotent). Do not touch rows with no matching alias.
>
> **Constraints.** Org-scoped. Idempotent (safe to re-run). No destructive ops. Don't hardcode any generated IDs. Keep it to data backfill — no schema changes beyond what's needed (the columns already exist).
>
> **Validation (include as a verification query in your PR description, with results).** Report, per table: total rows, rows with raw type, rows resolved after backfill, % resolved. Then a per-canonical-type breakdown for historical_jobs (top 20 by count) so we can eyeball that the common types (Tandem Axle Service, Insurance Inspection, Water Damage / Leak Repair, Annual / 12-Month Service, etc.) are well-populated.
>
> **Output.** Migration committed on a branch step-4d-phase0-jobtype-backfill, pushed, PR opened. Self-test the verification query via MCP before handing back. Do not merge — stop and show me the verification results for review.
>
> **Expected ballpark** (so you can sanity-check): ~2,100 of 4,432 historical_jobs should resolve (~48%); common service/repair types should each land dozens-to-hundreds. If you get wildly different numbers, stop and tell me before proceeding.

## 11. How tomorrow runs
1. Paste the Phase 0 prompt → review verification → merge if the coverage matches expectation.
2. /clear, then I write the Phase 0.5 prompt (coverage lift) — decide whether it's worth it based on Phase 0's numbers.
3. /clear per phase through 1 → 2 → 3 → 4, each with its gate. Phase 2 is the one where you and Cath eyeball the templates — that's the real go/no-go for the whole feature.
4. Phase 5 (UI) only after the data layer is proven.

I'll write each phase's prompt fresh when we reach it, so each is grounded in the prior phase's actual results rather than guessed ahead.
