# Step 4a.1 — Similarity Overhaul + Panel UX

**Context for Claude Code:** Step 4a shipped Shopbook's quote drafting surface, including a "Find similar past quotes" right-side panel powered by the `find_similar_quotes` SQL function. Live testing revealed the similarity scoring is too weak to be useful — most historical quotes have NULL `resolved_canonical_job_type_id` and empty/thin descriptions, so results are nearly all scoring 60 (vehicle make + model only) and James can't tell which one is the right match.

This step rebuilds the similarity function and enriches the panel UI so the "wow moment" actually works.

## Data audit (run before designing — Ryan has already done this, results below)

For situational awareness, here's the description quality reality:

- 1,288 total historical_quotes
- 143 have description populated (11%)
- 567 have comments populated (44%)
- 651 have at least one of the two (51%)
- The remaining 49% have neither — text signal must come from line item descriptions
- Both description and comments contain boilerplate that must be stripped: "Thank you for the opportunity", "This estimate is based on", "Further damage may be evident after dismantling", etc.

Verify these numbers on your own with a quick query before starting. If they've drifted, design accordingly.

## Goals

1. **Rebalance scoring** so description/content semantic match beats raw vehicle match.
2. **Use combined text** (description + comments + concatenated line item descriptions) for Jaccard.
3. **Strip boilerplate** before tokenisation.
4. **Infer damage tags** from the combined text via a one-time backfill on historical_quotes.
5. **Backfill `resolved_canonical_job_type_id`** via customer + vehicle + date matching against historical_jobs and historical_invoices where possible.
6. **Enrich the panel UI** with description preview, match-reason badges, job-shape summary, date, and visual hierarchy for the top match.

## Schema changes (migration 0022)

### `historical_quotes` additions:
- `inferred_damage_tags text[]` — populated by one-time backfill from text content
- `combined_search_text text` — generated column: `coalesce(description, '') || ' ' || coalesce(comments, '') || ' ' || (concatenated line item descriptions, truncated to 500 chars)`. Used as the canonical text source for similarity. Compute via a function called from a backfill script (not a generated column — Postgres generated columns can't reference other tables).
- `total_labour_hours numeric` — sum of labour line quantities, backfilled. Used for the "shape of the job" UI display.

### Boilerplate strip list
Create a small table `text_boilerplate_phrases` (organisation_scoped) with a seeded list:
- "thank you for the opportunity"
- "this estimate is based on"
- "further damage may be evident"
- "after dismantling"
- "owner supplied images"
- "thank you for your business"
- "continued support"
- "visual inspection"
- (add more if you find them in the data — query for top repeated phrases)

The Jaccard tokeniser checks this table and strips matching phrases before tokenising.

## Business logic changes (migration 0023)

### Rewrite `find_similar_quotes()`

New scoring weights:
- vehicle_make match: +25 (was +40)
- vehicle_model match: +15 (was +20)
- resolved_canonical_job_type_id match: +30 (unchanged but now actually fires for some rows after backfill)
- damage_tags overlap (live quote vs historical inferred_damage_tags): up to +40, proportional (e.g. 2 of 3 tags overlap = +27)
- combined_search_text Jaccard: up to +60 (was +30, on description only)
- Recency bonus: +5 if quote within last 12 months, +0 otherwise (mild nudge toward more recent pricing)

Total max score is now ~175. Top results should land in the 80-150 range when the match is genuinely strong; 30-60 when it's just a vehicle match. This gives James visible spread.

The function should also return:
- `match_reasons text[]` — which scoring components contributed > 0 (e.g. `['vehicle_make','damage_tags:hail,panel','description_match']`)
- `preview_text text` — first 80 chars of combined_search_text, used for the description shown in UI
- `total_labour_hours numeric`
- `parts_total numeric` and `labour_total numeric` — computed from line items
- `issue_date date` — for showing the date on the card
- `score numeric`

### Tokeniser helper function

`tokenize_for_similarity(p_text text, p_org_id uuid) returns text[]`:
1. Lowercase
2. Strip boilerplate phrases (lookup against text_boilerplate_phrases)
3. Remove punctuation except hyphens
4. Split on whitespace
5. Filter out stopwords (a, an, the, to, of, and, or, for, in, on, with, by, etc. — small built-in list)
6. Filter out tokens of length < 3
7. Apply basic stemming — strip common suffixes (-s, -ed, -ing) to a normalised root
8. Return deduplicated array

### Damage tag inference

Build a small set of canonical damage tag keywords:
- hail, water, leak, panel, mould, awning, decal, sticker, axle, suspension, brake, wheel, roof, ceiling, floor, wall, door, window, lock, hatch, slide, slideout, seal, sealing, electrical, gas, plumbing, fridge, hotwater, aircon, light, jack, hitch, chassis, impact, collision, scratch, scrape, dent, crack

Write a backfill script that:
1. Loops over all historical_quotes
2. Computes combined_search_text for each
3. Tokenises (using the same tokeniser as similarity)
4. Matches tokens against canonical damage tag list (with stem-aware matching)
5. Populates `inferred_damage_tags`

For the live quote side, the existing `damage_tags text[]` field on `quotes` is what the user enters at quote creation. No change needed there.

### `resolved_canonical_job_type_id` backfill

Best-effort matching strategy:
1. For each historical_quote, find historical_jobs for the same customer_external_id where issue_date is within 90 days of the quote's issue_date.
2. If exactly one match → use its canonical_job_type_id.
3. If multiple matches → use the one closest in date.
4. If no historical_jobs match, try the same logic against historical_invoices.
5. If still no match, leave NULL.

Expect 40-60% match rate. Document the actual match rate in the step summary.

## UI changes — the panel rebuild

### `similar-quotes-panel.tsx`

Each card should display:

**Row 1 (heading):** Vehicle make + model in larger weight. Right-aligned: `historical · score 142` (or `live` if from quotes table).

**Row 2 (preview):** preview_text from the function. Italic, smaller, truncate at ~100 chars with ellipsis. If empty, fall back to "No description available — matched on vehicle."

**Row 3 (match reasons):** Small badges/chips showing match_reasons. Examples:
- `vehicle` (grey)
- `damage tags: hail, panel` (blue, more prominent)
- `description match` (blue)
- `job type: storm damage repair` (green)
- `recent` (small grey "12 months" pill)

Visual weight: the "why this is a good match" tags get more visible styling than the generic "vehicle" tag, so James's eye is drawn to the strong signals.

**Row 4 (shape):** `{line_count} lines · {labour_hours}hr · ${total} · {month year}`. E.g. "9 lines · 6hr · $2,691 · Mar 2024". Quotes older than 18 months get the date in muted/orange colour as a "pricing may be stale" signal.

**Row 5 (action):** "Clone all lines" button as before.

### Top-result visual treatment

If the top result's score is at least 1.5× the second result's score, render the top card with:
- Thicker border (border-2, primary colour)
- Small "Best match" badge above the vehicle name
- Slightly larger padding

If the top result is not meaningfully ahead of the others, render all cards identically (no Best match badge). This is important — we only want the "Best match" treatment when the algorithm is actually confident.

### Empty state

If `find_similar_quotes` returns no results (rare but possible for an obscure vehicle), show a friendly empty state: "No similar past quotes found. Start from scratch by adding line items below."

## Tech notes

- Build order: migration 0022 (schema) → migration 0023 (functions + tokeniser) → backfill script (run once via a Node script or `psql` command, NOT as part of a migration so it can be re-run) → UI changes.
- Backfill script lives at `scripts/backfill-historical-similarity.ts`. Document in step summary how to re-run.
- Generated column for `combined_search_text` isn't viable because it references line items. Use the backfill script to populate it, and add a trigger on historical_quote_items that re-computes the parent quote's combined_search_text on insert/update/delete. This keeps it fresh if the import is re-run.
- The boilerplate strip list is hardcoded for the seed but stored in a table so Catherine/James can edit it later via a future settings screen (don't build the screen now — just the table).
- Match reason badges should be a small reusable component so we can re-use the styling elsewhere later.
- The new scoring weights apply equally to live `quotes` and historical_quotes — make sure the function handles both sources cleanly. For live quotes, `combined_search_text` should be computed inline from the quote's description + line items at query time (since live quotes don't have the pre-computed field).

## Acceptance test

Run via Supabase MCP script:

1. Use the existing RACQ insurer + create a test quote for a Jayco Starcraft with description "Hail damage to side panels, roof denting, awning rail bent" and damage_tags ['hail', 'panel', 'roof', 'awning'].
2. Call `find_similar_quotes` against the corpus.
3. Assert:
   - Top result's score is higher than the previous all-60 baseline (expect 90-150 range)
   - Top result's match_reasons includes at least one of `damage_tags` or `description_match`
   - Top result has a non-empty preview_text
   - At least 3 results returned
   - Results are ordered by score descending
4. Verify visually in the running app (Ryan + James will do this manually):
   - Cards now show description preview
   - Match reason badges render
   - Shape summary line is visible
   - If top score is meaningfully higher, "Best match" treatment is applied
5. Confirm `inferred_damage_tags` is populated on at least 70% of historical_quotes after backfill
6. Confirm `resolved_canonical_job_type_id` backfill resolved at least 40% of historical_quotes
7. Clean up the test quote/customer/van

## Commit boundaries

1. Schema migration 0022 (columns + boilerplate table)
2. Business logic migration 0023 (tokeniser, rewritten find_similar_quotes, helpers)
3. Backfill script + run + verification queries
4. Panel UI rebuild
5. Self-test + docs/step4a1-summary.md + final build/push

## Out of scope (explicit — do not build)

- Embedding-based similarity (still future, post-Step-4b)
- AI-generated summaries of historical quotes
- A "show me more like this" feature on individual results
- Settings UI for editing the boilerplate phrase list (table exists, screen comes later)
- Refinement of the canonical damage tag keyword list beyond the seed (Catherine can refine later if needed)
- Changes to the live quote creation flow's damage_tags input (the chip input from 4a is fine)

## Open questions to flag in the plan (don't assume)

- If the boilerplate strip table is missing for a tenant, does the tokeniser fail silently or refuse? (Recommendation: fail silently, just skip the strip step.)
- Should the score be displayed as a number, or a 1-5 star equivalent? (Recommendation: keep the number for now — useful for debugging during James's first sessions. Hide later once everyone trusts the algorithm.)
- For the recency bonus, what date does the live quote use as "now"? (Recommendation: now() — straightforward.)

## Wrap-up

Write `docs/step4a1-summary.md` covering:
- Migrations 0022 + 0023 applied
- Backfill stats (% damage tags populated, % canonical job type resolved, score distribution before/after)
- UI changes
- Acceptance test results
- Anything noted for 4b or later
- Known gaps
