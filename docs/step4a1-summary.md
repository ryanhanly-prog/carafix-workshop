# Step 4a.1 summary — Similarity overhaul + panel UX

Completed 2026-05-27. Project `uckshjquyupolwwglacm`. `npm run build` passes,
`tsc --noEmit` clean. Self-test: **6/6 assertions pass**.

## Migrations
- **0022_similarity_schema** — `historical_quotes`: `inferred_damage_tags`,
  `combined_search_text`, `total_labour_hours`; `text_boilerplate_phrases`
  (org-scoped, RLS, seeded with the strip list + extras found in the data).
- **0023_similarity_logic** — tokeniser, helpers, rewritten `find_similar_quotes`,
  the `historical_quotes.search_tokens` perf column + freshness trigger, and the
  backfill functions. (Data-audit numbers verified before starting: 1,288 quotes,
  143 desc / 11%, 567 comments / 44%, 651 either / 51% — no drift.)

## Business logic
- `tokenize_for_similarity(text, org)` — lowercase → strip boilerplate (table
  lookup, **fails silently** if absent) → de-punctuate (keep hyphens) → drop
  stopwords/short tokens → light suffix stemming → dedupe.
- `compute_combined_search_text(quote_id)` = description + comments + line-item
  descriptions (line items capped at 500 chars).
- `infer_damage_tags(tokens)` — stem-aware match against the canonical keyword set.
- `find_similar_quotes` rewritten: **make +25, model +15, job type +30,
  damage-tags ≤+40 (proportional), combined-text Jaccard ≤+60, recency +5**
  (~175 max). Returns `match_reasons[]`, `preview_text`, `total_labour_hours`,
  `parts_total`, `labour_total`, `issue_date`, `score`. Handles historical
  (precomputed) and live (combined text + tokens computed inline) cleanly.
- `historical_quotes.search_tokens` precomputed (perf — avoids re-tokenising 1,288
  candidates per query); kept fresh by a statement-level trigger on
  `historical_quote_items` (combined_search_text + search_tokens only).

## Backfill (`scripts/backfill-historical-similarity.ts`, re-runnable)
Calls the set-based SQL backfill functions in dependency order. Run results
(Carafix, ~9s):

| field | coverage |
|-------|----------|
| combined_search_text | 1,280 / 1,288 (**99%**) |
| total_labour_hours | 1,288 (100%) |
| inferred_damage_tags | 1,120 / 1,288 (**87%**, target ≥70%) |
| resolved_canonical_job_type_id | **0 / 1,288 (0%)** — see gating note |

Re-run with `npx tsx scripts/backfill-historical-similarity.ts`.

### Canonical-backfill gating note (criterion #6 not met today — by design)
`resolved_canonical_job_type_id` resolved **0%**, against the prompt's ≥40%
target. This is **gated on Catherine mapping job-type aliases**, not on this step:
- `historical_jobs.job_type_canonical_id` and `historical_invoices.job_type_canonical_id`
  are 0% populated, and **0 job-type aliases are mapped** (Step 3.6 left that as
  Catherine's "Accept all suggestions" / hand-map task).
- Per the approved **Option A**, the backfill resolves the matched job/invoice's
  **raw label through the *current* alias mapping** (org-explicit join), so it
  **auto-improves the moment Catherine maps aliases** — just re-run the script, no
  schema change. The customer+date *matching* already works (all rows have
  customer_external_id); only the canonical value it copies is currently NULL.
- The step's real value — **description + damage-tag matching** — is unaffected and
  working (see scores below). The +30 job-type term simply lies dormant until
  aliases are mapped.

## Score distribution — before vs after
- **Before:** nearly all results scored a flat **60** (vehicle make+model only);
  no spread, James couldn't tell matches apart.
- **After** (acceptance query — Jayco Starcraft, "Hail damage to side panels, roof
  denting, awning rail bent", tags hail/panel/roof/awning): **83.8, 75.2, 64.9,
  62.9, 61.4** — genuine spread. The #1 is a live quote (Ryan's own Q-100001,
  expected); the top **historical** match scores 75.2 with reasons
  `vehicle_make, vehicle_model, damage_tags:panel,roof,awning, description_match` —
  exactly the intended "wow". Strong matches land ~75–90 here (the prompt's
  optimistic 90–150 needs higher description-Jaccard; partial-overlap real data
  lands a bit lower, still well above the 60 floor with clear ranking).

## UI changes (`similar-quotes-panel.tsx`, extracted from the editor)
- Cards: vehicle heading + `source · score`; italic preview (fallback line);
  weighted **match-reason chips** (new reusable `match-reason-badge.tsx` — damage/
  description/job-type prominent, vehicle/recent muted); shape line
  (`N lines · Xhr · $total · Mon YYYY`, **>18-month dates in orange** as a stale-
  pricing signal); Clone button.
- **"Best match"** treatment (thick primary border, badge, extra padding) only when
  the top score ≥ 1.5× the second — otherwise uniform cards.
- Friendly empty state.

## Acceptance test (`scripts/test-similarity.ts`)
6/6 passed: ≥3 results, ordered descending (84/75/65/63), top score > 60 baseline
with damage_tags/description_match reasons + non-empty preview, inferred-damage-tag
coverage 87% (≥70%). Criterion #6 reported as info (0%, gated — above). Cleans up
its test quote/customer/van. Ryan's manually-created Q-100001 was left intact.

## Noted for 4b / later
- **Unlock the job-type signal:** once Catherine runs "Accept all suggestions
  (>70%)" + hand-maps the top aliases, re-run the backfill to light up
  `resolved_canonical_job_type_id` (and the +30 term).
- Similarity tuning candidates: synonym map (e.g. "mould"/"mold", "decal"/"sticker"),
  bigram matching, and weighting line-item descriptions separately from prose.
- SQL stemming is deliberately light; an embedding-based pass remains the
  post-4b plan.
- `match_reasons` emits `job_type` without the type name (function returns the id,
  not the label); the badge shows a generic "job type". Wire the name through if
  desired later.

## Known gaps / rough edges
- `combined_search_text`/`search_tokens` are refreshed by the item trigger on
  re-import, but `inferred_damage_tags`/`total_labour_hours` are backfill-only and
  go stale after a re-import until the backfill re-runs (re-runnable by design).
- Live quotes appear in their own "similar" results for *other* quotes (correct);
  the editor excludes only the current quote (client-side), matching 4a.
