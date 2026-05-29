-- 0033 — Phase 2 stats & signals (Step 4d Phase 2)
--
-- Layer 2 of the 4d data spine. Reads from the Phase 1 rollup
-- (historical_job_rollup + historical_job_rollup_lines) and the typed
-- historical_quotes / historical_quote_items corpus. Writes:
--
--   1. job_type_scope_stats         — per (type × SKU) and (type × category)
--                                     frequency + qty distribution. Category
--                                     rows ensure unclassified/no-SKU value
--                                     (Water Damage 27%, Insurance 59%) is
--                                     surfaced rather than lost.
--   2. job_type_labour_stats        — per type charged-hours median+p25/p75
--                                     and a HARD suppress_labour_autofill
--                                     boolean for insurance-category types
--                                     (Cath/James rule: insurance labour is
--                                     never auto-predicted).
--   3. job_type_stats_reliability   — per type bucket-share roll → three-tier
--                                     stats_reliability flag (sku_viable /
--                                     retrieval_led / retrieval_only). The
--                                     engine's switchboard for whether to
--                                     surface "usual SKU" annotations.
--   4. job_type_part_signals        — per (type × SKU/category), POPULATION-
--                                     level quote-freq vs invoice-freq +
--                                     delta, classified as correction /
--                                     cross_sell / noise / core_aligned. Per-
--                                     job-paired deltas (354 thin pairs) are
--                                     deferred to flywheel v2 by design.
--   5. draft_excluded_skus          — denylist config; seeded with ROUNDING.
--
-- Also extends:
--   - sku_price_stats — adds tiered recency pricing (recent_rich ≥3 sales in
--     trailing 12mo / recent_thin 1–2 / alltime 0 / unknown). Every priced
--     line carries its tier as a confidence badge. No silent stale pricing.
--   - historical_job_rollup — adds combined_search_text / search_tokens /
--     inferred_damage_tags + GINs, reusing tokenize_for_similarity and
--     infer_damage_tags. Sets up Phase 3's job-native retrieval.
--   - historical_quotes / quotes — adds kind ('realized'|'template'|
--     'live_committed') + realized_at. EVERY Layer 2 stats query filters on
--     kind so pricing/frequency use only real data. Retrieval (Phase 3) may
--     additionally see template rows. No authoring path — flag + filtering
--     only; template insertion is a deferred app-layer feature.
--
-- Refresh model: refresh_job_type_stats(p_org) rebuilds items 1–4 + the
-- recency extension on sku_price_stats. Search enrichment on the rollup is
-- folded into the existing refresh_job_rollup(p_org). Both transactional,
-- idempotent, byte-equivalent on re-run (modulo refreshed_at).
--
-- Tier classification thresholds are codified to the Phase 2 investigation
-- (29 May 2026): insurance_inspection and warranty_work expected retrieval_
-- only; water_damage/electrical_repair/awning_repair/annual_service/
-- storm_damage retrieval_led; tandem/logbook/single_axle/first_service/
-- upgrade_install sku_viable. Validation asserts this hard.

BEGIN;

-- ============================================================================
-- A. Quote kind + realized_at — flag + filtering only (no authoring path).
-- ============================================================================
-- Every Layer 2 query joining historical_quotes filters kind='realized'.
-- Pricing/frequency stats use only real data. Retrieval (Phase 3) may see
-- templates. The flag must exist now so stats are correct from day one and
-- never need retrofitting once template/live data lands.

ALTER TABLE historical_quotes
  ADD COLUMN kind        text NOT NULL DEFAULT 'realized'
    CHECK (kind IN ('realized','template','live_committed')),
  ADD COLUMN realized_at timestamptz;

UPDATE historical_quotes
SET realized_at = issue_date::timestamptz
WHERE realized_at IS NULL;

CREATE INDEX idx_hist_quotes_kind_type
  ON historical_quotes (organisation_id, kind, resolved_canonical_job_type_id);

-- Live quotes.kind is NULL on drafts; promoted only when the customer accepts
-- (status='approved') or the quote turns into work (status='converted_to_job').
-- 'sent' is excluded because the customer hasn't decided — pricing on a
-- rejected quote is not realized truth.
ALTER TABLE quotes
  ADD COLUMN kind        text
    CHECK (kind IS NULL OR kind IN ('realized','template','live_committed')),
  ADD COLUMN realized_at timestamptz;

UPDATE quotes
SET kind = 'live_committed',
    realized_at = COALESCE(sent_at, updated_at)
WHERE status IN ('approved','converted_to_job');

CREATE INDEX idx_quotes_kind ON quotes (organisation_id, kind) WHERE kind IS NOT NULL;

-- ============================================================================
-- B. draft_excluded_skus — denylist config (small, editable later).
-- ============================================================================
CREATE TABLE draft_excluded_skus (
  organisation_id  uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  scope_kind       text NOT NULL CHECK (scope_kind IN ('sku','category')),
  scope_key        text NOT NULL,
  reason           text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, scope_kind, scope_key)
);

ALTER TABLE draft_excluded_skus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "draft_excluded_select_org" ON draft_excluded_skus
  FOR SELECT USING (organisation_id = current_user_org_id());

INSERT INTO draft_excluded_skus (organisation_id, scope_kind, scope_key, reason)
VALUES
  ('00000000-0000-0000-0000-000000000002', 'sku', 'ROUNDING',
   'Round-up noise; not a real line item.');

-- ============================================================================
-- C. job_type_scope_stats — per (type × SKU) AND (type × category).
-- ============================================================================
-- Raw frequencies/counts only; no "usual/rare" threshold baked in. Engine
-- (Phase 4) decides presentation thresholds, variance-aware.
CREATE TABLE job_type_scope_stats (
  organisation_id        uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  job_type_canonical_id  uuid NOT NULL REFERENCES job_type_canonical(id),
  scope_kind             text NOT NULL CHECK (scope_kind IN ('sku','category')),
  scope_key              text NOT NULL,
  display_label          text,
  line_bucket            text,
  sample_size_jobs       int  NOT NULL,
  appearance_jobs        int  NOT NULL,
  frequency_pct          numeric NOT NULL,
  median_qty             numeric,
  p25_qty                numeric,
  p75_qty                numeric,
  median_unit_price      numeric,
  total_appearances      int  NOT NULL,
  refreshed_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, job_type_canonical_id, scope_kind, scope_key)
);

CREATE INDEX idx_scope_stats_lookup
  ON job_type_scope_stats (organisation_id, job_type_canonical_id, scope_kind, frequency_pct DESC);

-- Cross-type lookup so part_signals can ask "is this SKU core in another type?"
CREATE INDEX idx_scope_stats_cross_type
  ON job_type_scope_stats (organisation_id, scope_kind, scope_key, frequency_pct DESC);

ALTER TABLE job_type_scope_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scope_stats_select_org" ON job_type_scope_stats
  FOR SELECT USING (organisation_id = current_user_org_id());

-- ============================================================================
-- D. job_type_labour_stats — per type + suppress switch for insurance.
-- ============================================================================
-- suppress_labour_autofill is a HARD switch read by Phase 4: when true the
-- engine leaves labour blank regardless of any computed median. The median is
-- still stored for ad-hoc review.
CREATE TABLE job_type_labour_stats (
  organisation_id           uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  job_type_canonical_id     uuid NOT NULL REFERENCES job_type_canonical(id),
  sample_size_jobs          int  NOT NULL,
  median_hours              numeric,
  p25_hours                 numeric,
  p75_hours                 numeric,
  mean_hours                numeric,
  stddev_hours              numeric,
  reliability               text NOT NULL CHECK (reliability IN ('high','medium','low')),
  reliability_reason        text,
  suppress_labour_autofill  boolean NOT NULL DEFAULT false,
  refreshed_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, job_type_canonical_id)
);

ALTER TABLE job_type_labour_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "labour_stats_select_org" ON job_type_labour_stats
  FOR SELECT USING (organisation_id = current_user_org_id());

-- ============================================================================
-- E. job_type_stats_reliability — per type three-tier flag.
-- ============================================================================
-- Drives the engine's "show SKU annotations or not" decision per type.
CREATE TABLE job_type_stats_reliability (
  organisation_id        uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  job_type_canonical_id  uuid NOT NULL REFERENCES job_type_canonical(id),
  sample_size_jobs       int  NOT NULL,
  labour_share_pct       numeric,
  parts_share_pct        numeric,
  unclassified_share_pct numeric,
  rounding_share_pct     numeric,
  stats_reliability      text NOT NULL
    CHECK (stats_reliability IN ('sku_viable','retrieval_led','retrieval_only')),
  reliability_reason     text,
  refreshed_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, job_type_canonical_id)
);

ALTER TABLE job_type_stats_reliability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stats_reliability_select_org" ON job_type_stats_reliability
  FOR SELECT USING (organisation_id = current_user_org_id());

-- ============================================================================
-- F. job_type_part_signals — population-level cross-sell / correction.
-- ============================================================================
-- Computed from two INDEPENDENT populations (typed historical_quotes vs typed
-- historical_job_rollup). NOT joined per-job. Per-job pairing deferred to
-- flywheel v2 (only 354 clean pairs exist today; not stat-grade).
CREATE TABLE job_type_part_signals (
  organisation_id          uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  job_type_canonical_id    uuid NOT NULL REFERENCES job_type_canonical(id),
  scope_kind               text NOT NULL CHECK (scope_kind IN ('sku','category')),
  scope_key                text NOT NULL,
  display_label            text,
  quote_sample_jobs        int  NOT NULL,
  quote_appearance_jobs    int  NOT NULL,
  quote_freq_pct           numeric NOT NULL,
  invoice_sample_jobs      int  NOT NULL,
  invoice_appearance_jobs  int  NOT NULL,
  invoice_freq_pct         numeric NOT NULL,
  delta_pct                numeric NOT NULL,
  classification           text NOT NULL
    CHECK (classification IN ('correction','cross_sell','noise','core_aligned')),
  classification_reason    text,
  refreshed_at             timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, job_type_canonical_id, scope_kind, scope_key)
);

CREATE INDEX idx_part_signals_actionable
  ON job_type_part_signals (organisation_id, job_type_canonical_id, classification, delta_pct DESC);

ALTER TABLE job_type_part_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "part_signals_select_org" ON job_type_part_signals
  FOR SELECT USING (organisation_id = current_user_org_id());

-- ============================================================================
-- G. sku_price_stats — tiered recency pricing extension.
-- ============================================================================
-- Tier set per SKU at refresh time. recommended_price is the engine's pick;
-- the tier is the confidence badge.
ALTER TABLE sku_price_stats
  ADD COLUMN uses_12mo              int NOT NULL DEFAULT 0,
  ADD COLUMN median_price_12mo      numeric(12,4),
  ADD COLUMN median_cost_12mo       numeric(12,4),
  ADD COLUMN median_markup_pct_12mo numeric(10,2),
  ADD COLUMN last_price_12mo        numeric(12,4),
  ADD COLUMN last_used_date_12mo    date,
  ADD COLUMN recency_tier           text NOT NULL DEFAULT 'unknown'
    CHECK (recency_tier IN ('recent_rich','recent_thin','alltime','unknown')),
  ADD COLUMN recommended_price      numeric(12,4);

CREATE INDEX idx_sku_stats_recency
  ON sku_price_stats (organisation_id, recency_tier);

-- ============================================================================
-- H. historical_job_rollup search enrichment.
-- ============================================================================
-- Quote-side search infrastructure already exists on historical_quotes
-- (combined_search_text, search_tokens, inferred_damage_tags). The rollup
-- gets the same shape so Phase 3's job-native matcher can search jobs.
ALTER TABLE historical_job_rollup
  ADD COLUMN combined_search_text  text,
  ADD COLUMN search_tokens         text[],
  ADD COLUMN inferred_damage_tags  text[],
  ADD COLUMN search_refreshed_at   timestamptz;

CREATE INDEX idx_job_rollup_search_tokens
  ON historical_job_rollup USING GIN (search_tokens);

CREATE INDEX idx_job_rollup_damage_tags
  ON historical_job_rollup USING GIN (inferred_damage_tags);

-- Mirrors compute_combined_search_text(p_quote_id) but job-keyed. Aggregates
-- job description + parent invoice description + DISTINCT line descriptions,
-- stock_names, categories — the full surface a Phase 3 matcher would query.
CREATE OR REPLACE FUNCTION compute_combined_search_text_for_job(p_org uuid, p_job_number text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH parts AS (
    SELECT r.description AS t
      FROM historical_job_rollup r
     WHERE r.organisation_id = p_org AND r.job_number = p_job_number
    UNION ALL
    SELECT i.description
      FROM historical_invoices i
      JOIN historical_job_rollup r ON r.invoice_id = i.id
     WHERE r.organisation_id = p_org AND r.job_number = p_job_number
    UNION ALL
    SELECT DISTINCT l.description
      FROM historical_job_rollup_lines l
     WHERE l.organisation_id = p_org AND l.job_number = p_job_number
       AND l.description IS NOT NULL
    UNION ALL
    SELECT DISTINCT l.stock_name
      FROM historical_job_rollup_lines l
     WHERE l.organisation_id = p_org AND l.job_number = p_job_number
       AND l.stock_name IS NOT NULL
    UNION ALL
    SELECT DISTINCT l.category
      FROM historical_job_rollup_lines l
     WHERE l.organisation_id = p_org AND l.job_number = p_job_number
       AND l.category IS NOT NULL
  )
  SELECT string_agg(t, ' ' ORDER BY t)
    FROM parts
   WHERE COALESCE(btrim(t), '') <> '';
$$;

COMMENT ON FUNCTION compute_combined_search_text_for_job(uuid, text) IS
  'Job-keyed equivalent of compute_combined_search_text(p_quote_id). Used by '
  'refresh_job_rollup to populate historical_job_rollup.combined_search_text.';

-- ============================================================================
-- I. refresh_sku_price_stats — extended with recency tiers.
-- ============================================================================
-- The HAVING count(*) >= 3 lifetime guard stays (sub-3 SKUs are "unknown" and
-- get no row; engine falls back to retrieval/panel). recent_rich/thin/alltime
-- are partitions within the qualified set.
CREATE OR REPLACE FUNCTION refresh_sku_price_stats(p_org uuid DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows   int := 0;
  v_cutoff date := (current_date - interval '12 months')::date;
BEGIN
  IF p_org IS NULL THEN
    DELETE FROM sku_price_stats;
  ELSE
    DELETE FROM sku_price_stats WHERE organisation_id = p_org;
  END IF;

  WITH src AS (
    SELECT
      organisation_id,
      stock_number,
      unit_cost,
      unit_price,
      created_at_external,
      created_at_external::date AS used_date
    FROM historical_invoice_items
    WHERE stock_number IS NOT NULL
      AND stock_number <> ''
      AND stock_number <> 'LAB'
      AND unit_price > 0
      AND created_at_external IS NOT NULL
      AND (p_org IS NULL OR organisation_id = p_org)
  ),
  agg_all AS (
    SELECT
      organisation_id,
      stock_number,
      COUNT(*)::int                                                          AS uses,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY unit_price)                AS median_price,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY unit_cost)
        FILTER (WHERE unit_cost > 0)                                         AS median_cost,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY ((unit_price - unit_cost) / unit_cost) * 100)
        FILTER (WHERE unit_cost > 0)                                         AS median_markup_pct,
      MAX(used_date)                                                         AS last_used_date
    FROM src
    GROUP BY organisation_id, stock_number
    HAVING COUNT(*) >= 3
  ),
  agg_12mo AS (
    SELECT
      organisation_id,
      stock_number,
      COUNT(*)::int                                                          AS uses_12mo,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY unit_price)                AS median_price_12mo,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY unit_cost)
        FILTER (WHERE unit_cost > 0)                                         AS median_cost_12mo,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY ((unit_price - unit_cost) / unit_cost) * 100)
        FILTER (WHERE unit_cost > 0)                                         AS median_markup_pct_12mo,
      MAX(used_date)                                                         AS last_used_date_12mo
    FROM src
    WHERE used_date >= v_cutoff
    GROUP BY organisation_id, stock_number
  ),
  last_row_all AS (
    SELECT DISTINCT ON (organisation_id, stock_number)
      organisation_id, stock_number,
      unit_price AS last_price,
      unit_cost  AS last_cost
    FROM src
    ORDER BY organisation_id, stock_number, created_at_external DESC
  ),
  last_row_12mo AS (
    SELECT DISTINCT ON (organisation_id, stock_number)
      organisation_id, stock_number,
      unit_price AS last_price_12mo
    FROM src
    WHERE used_date >= v_cutoff
    ORDER BY organisation_id, stock_number, created_at_external DESC
  )
  INSERT INTO sku_price_stats (
    organisation_id, stock_number, uses,
    median_cost, median_price, median_markup_pct,
    last_price, last_cost, last_used_date, refreshed_at,
    uses_12mo, median_price_12mo, median_cost_12mo, median_markup_pct_12mo,
    last_price_12mo, last_used_date_12mo,
    recency_tier, recommended_price
  )
  SELECT
    a.organisation_id, a.stock_number, a.uses,
    a.median_cost, a.median_price, a.median_markup_pct,
    lr.last_price, lr.last_cost, a.last_used_date, now(),
    COALESCE(a12.uses_12mo, 0),
    a12.median_price_12mo, a12.median_cost_12mo, a12.median_markup_pct_12mo,
    lr12.last_price_12mo, a12.last_used_date_12mo,
    CASE
      WHEN COALESCE(a12.uses_12mo, 0) >= 3 THEN 'recent_rich'
      WHEN COALESCE(a12.uses_12mo, 0) BETWEEN 1 AND 2 THEN 'recent_thin'
      ELSE 'alltime'
    END AS recency_tier,
    CASE
      WHEN COALESCE(a12.uses_12mo, 0) >= 1 THEN a12.median_price_12mo
      ELSE a.median_price
    END AS recommended_price
  FROM agg_all a
  JOIN last_row_all lr
    ON lr.organisation_id = a.organisation_id AND lr.stock_number = a.stock_number
  LEFT JOIN agg_12mo a12
    ON a12.organisation_id = a.organisation_id AND a12.stock_number = a.stock_number
  LEFT JOIN last_row_12mo lr12
    ON lr12.organisation_id = a.organisation_id AND lr12.stock_number = a.stock_number;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END
$$;

COMMENT ON FUNCTION refresh_sku_price_stats(uuid) IS
  'Rebuilds sku_price_stats with tiered recency pricing. recency_tier set per '
  'SKU at refresh time: recent_rich >=3 uses in trailing 12mo, recent_thin '
  '1-2, alltime 0 (with >=3 lifetime). SKUs with <3 lifetime uses get no row '
  '(engine treats as ''unknown'' and falls back).';

REVOKE ALL ON FUNCTION refresh_sku_price_stats(uuid) FROM public;

-- ============================================================================
-- J. refresh_job_rollup — extended with search enrichment pass.
-- ============================================================================
-- Body unchanged except for the trailing UPDATE pass that fills the new
-- search columns by calling compute_combined_search_text_for_job and the
-- existing tokenize_for_similarity / infer_damage_tags helpers. Keeps Phase 3
-- retrieval on the same tokenizer/vocabulary as quote-side retrieval.
CREATE OR REPLACE FUNCTION refresh_job_rollup(p_org uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows int := 0;
BEGIN
  DELETE FROM historical_job_rollup WHERE organisation_id = p_org;

  INSERT INTO historical_job_rollup (
    organisation_id, job_number,
    job_type_canonical_id, job_type_slug, job_type_name, job_type_category,
    description, job_type_raw, estimate_hours,
    job_start_time, job_finish_time, job_status,
    vehicle_number, vehicle_external_id, van_make, van_model, van_year, registration_number,
    customer_external_id, customer_number, customer_name,
    charged_hours_total, charged_hours_internal, amount_charged_total,
    timesheet_count, timesheet_count_billable,
    invoice_id, invoice_number, invoice_issue_date,
    invoice_net_amount, invoice_total_amount, invoice_total_cost,
    items_count, items_total_amount, items_net_amount, items_cogs,
    items_labour_total, items_labour_count,
    items_parts_total, items_parts_count,
    items_unclassified_total, items_unclassified_count,
    items_rounding_total, items_rounding_count,
    has_invoice, has_timesheets, has_billable_hours,
    refreshed_at
  )
  SELECT
    j.organisation_id, j.job_number,
    j.job_type_canonical_id, jtc.slug, jtc.name, jtc.category,
    j.description, j.job_type_raw, j.estimate_hours,
    j.start_time, j.finish_time, j.status,
    j.vehicle_number, v.external_id, v.make, v.model, v.year,
    COALESCE(j.registration_number, v.registration_number),
    j.customer_external_id, j.customer_number, j.customer_name,
    COALESCE(ts.billable_hours, 0), COALESCE(ts.internal_hours, 0),
    COALESCE(ts.billable_amount, 0),
    COALESCE(ts.ts_count, 0), COALESCE(ts.ts_count_billable, 0),
    i.id, i.invoice_number, i.issue_date,
    i.net_amount, i.total_amount, i.total_cost,
    COALESCE(it.items_count, 0), COALESCE(it.items_total, 0),
    COALESCE(it.items_net, 0), COALESCE(it.items_cogs, 0),
    COALESCE(it.labour_total, 0), COALESCE(it.labour_count, 0),
    COALESCE(it.parts_total, 0),  COALESCE(it.parts_count, 0),
    COALESCE(it.unclass_total, 0),COALESCE(it.unclass_count, 0),
    COALESCE(it.round_total, 0),  COALESCE(it.round_count, 0),
    (i.id IS NOT NULL),
    (COALESCE(ts.ts_count, 0) > 0),
    (COALESCE(ts.billable_hours, 0) > 0),
    now()
  FROM historical_jobs j
  LEFT JOIN job_type_canonical jtc ON jtc.id = j.job_type_canonical_id
  LEFT JOIN historical_vehicles v
    ON v.organisation_id = j.organisation_id AND v.vehicle_number = j.vehicle_number
  LEFT JOIN historical_invoices i
    ON i.organisation_id = j.organisation_id AND i.job_number = j.job_number
  LEFT JOIN LATERAL (
    SELECT
      SUM(total_amount) FILTER (WHERE category = 'LABOUR')                              AS labour_total,
      COUNT(*)          FILTER (WHERE category = 'LABOUR')                              AS labour_count,
      SUM(total_amount) FILTER (WHERE category IS NOT NULL AND category <> 'LABOUR'
                                  AND COALESCE(stock_number, '') <> 'ROUNDING')         AS parts_total,
      COUNT(*)          FILTER (WHERE category IS NOT NULL AND category <> 'LABOUR'
                                  AND COALESCE(stock_number, '') <> 'ROUNDING')         AS parts_count,
      SUM(total_amount) FILTER (WHERE category IS NULL
                                  AND COALESCE(stock_number, '') <> 'ROUNDING')         AS unclass_total,
      COUNT(*)          FILTER (WHERE category IS NULL
                                  AND COALESCE(stock_number, '') <> 'ROUNDING')         AS unclass_count,
      SUM(total_amount) FILTER (WHERE COALESCE(stock_number, '') = 'ROUNDING')          AS round_total,
      COUNT(*)          FILTER (WHERE COALESCE(stock_number, '') = 'ROUNDING')          AS round_count,
      SUM(total_amount) AS items_total,
      SUM(net_amount)   AS items_net,
      SUM(cogs)         AS items_cogs,
      COUNT(*)          AS items_count
    FROM historical_invoice_items it
    WHERE it.invoice_id = i.id
  ) it ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      SUM(charged_hours)  FILTER (WHERE is_internal_no_charge IS NOT TRUE) AS billable_hours,
      SUM(charged_hours)  FILTER (WHERE is_internal_no_charge IS TRUE)     AS internal_hours,
      SUM(amount_charged) FILTER (WHERE is_internal_no_charge IS NOT TRUE) AS billable_amount,
      COUNT(*)                                                              AS ts_count,
      COUNT(*) FILTER (WHERE is_internal_no_charge IS NOT TRUE)             AS ts_count_billable
    FROM historical_timesheets ts
    WHERE ts.organisation_id = j.organisation_id AND ts.job_number = j.job_number
  ) ts ON TRUE
  WHERE j.organisation_id = p_org
    AND j.job_type_canonical_id IS NOT NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  INSERT INTO historical_job_rollup_lines (
    organisation_id, job_number,
    job_type_canonical_id, job_type_slug,
    invoice_id, source_item_id,
    stock_number, stock_name, category, description,
    quantity, unit_price, unit_cost,
    net_amount, tax_amount, total_amount, cogs, discount_percentage,
    line_bucket, refreshed_at
  )
  SELECT
    j.organisation_id, j.job_number,
    j.job_type_canonical_id, jtc.slug,
    i.id, it.id,
    it.stock_number, it.stock_name, it.category, it.description,
    it.quantity, it.unit_price, it.unit_cost,
    it.net_amount, it.tax_amount, it.total_amount, it.cogs, it.discount_percentage,
    CASE
      WHEN COALESCE(it.stock_number, '') = 'ROUNDING' THEN 'rounding'
      WHEN it.category = 'LABOUR'                     THEN 'labour'
      WHEN it.category IS NULL                        THEN 'unclassified'
      ELSE                                                 'parts'
    END AS line_bucket,
    now()
  FROM historical_jobs j
  JOIN job_type_canonical jtc ON jtc.id = j.job_type_canonical_id
  JOIN historical_invoices i
    ON i.organisation_id = j.organisation_id AND i.job_number = j.job_number
  JOIN historical_invoice_items it ON it.invoice_id = i.id
  WHERE j.organisation_id = p_org
    AND j.job_type_canonical_id IS NOT NULL;

  -- Search enrichment pass — runs after lines exist so the helper can read them.
  UPDATE historical_job_rollup r
     SET combined_search_text = compute_combined_search_text_for_job(r.organisation_id, r.job_number),
         search_refreshed_at  = now()
   WHERE r.organisation_id = p_org;

  UPDATE historical_job_rollup r
     SET search_tokens = tokenize_for_similarity(r.combined_search_text, r.organisation_id)
   WHERE r.organisation_id = p_org
     AND r.combined_search_text IS NOT NULL;

  UPDATE historical_job_rollup r
     SET inferred_damage_tags = infer_damage_tags(r.search_tokens)
   WHERE r.organisation_id = p_org
     AND r.search_tokens IS NOT NULL;

  RETURN v_rows;
END
$$;

REVOKE ALL ON FUNCTION refresh_job_rollup(uuid) FROM public;

-- ============================================================================
-- K. refresh_job_type_stats(p_org) — rebuilds Layer 2 (items C–F + sku tiers).
-- ============================================================================
CREATE OR REPLACE FUNCTION refresh_job_type_stats(p_org uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope_rows  int := 0;
  v_labour_rows int := 0;
  v_relbl_rows  int := 0;
  v_signal_rows int := 0;
  v_sku_rows    int := 0;
BEGIN
  -- 1) job_type_scope_stats — per (type × SKU) and (type × category).
  DELETE FROM job_type_scope_stats WHERE organisation_id = p_org;

  WITH type_jobs AS (
    SELECT job_type_canonical_id, COUNT(DISTINCT job_number) AS sample_size_jobs
    FROM historical_job_rollup
    WHERE organisation_id = p_org
    GROUP BY job_type_canonical_id
  ),
  sku_agg AS (
    SELECT
      l.job_type_canonical_id,
      'sku'::text                                     AS scope_kind,
      l.stock_number                                  AS scope_key,
      mode() WITHIN GROUP (ORDER BY l.stock_name)     AS display_label,
      mode() WITHIN GROUP (ORDER BY l.line_bucket)    AS line_bucket,
      COUNT(DISTINCT l.job_number)::int               AS appearance_jobs,
      COUNT(*)::int                                   AS total_appearances,
      percentile_cont(0.5)  WITHIN GROUP (ORDER BY l.quantity)   AS median_qty,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY l.quantity)   AS p25_qty,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY l.quantity)   AS p75_qty,
      percentile_cont(0.5)  WITHIN GROUP (ORDER BY l.unit_price) AS median_unit_price
    FROM historical_job_rollup_lines l
    WHERE l.organisation_id = p_org
      AND l.stock_number IS NOT NULL
      AND l.stock_number <> ''
    GROUP BY l.job_type_canonical_id, l.stock_number
  ),
  cat_agg AS (
    SELECT
      l.job_type_canonical_id,
      'category'::text                                AS scope_kind,
      lower(btrim(l.category))                        AS scope_key,
      mode() WITHIN GROUP (ORDER BY l.category)       AS display_label,
      mode() WITHIN GROUP (ORDER BY l.line_bucket)    AS line_bucket,
      COUNT(DISTINCT l.job_number)::int               AS appearance_jobs,
      COUNT(*)::int                                   AS total_appearances,
      percentile_cont(0.5)  WITHIN GROUP (ORDER BY l.quantity)   AS median_qty,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY l.quantity)   AS p25_qty,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY l.quantity)   AS p75_qty,
      percentile_cont(0.5)  WITHIN GROUP (ORDER BY l.unit_price) AS median_unit_price
    FROM historical_job_rollup_lines l
    WHERE l.organisation_id = p_org
      AND l.category IS NOT NULL
      AND btrim(l.category) <> ''
    GROUP BY l.job_type_canonical_id, lower(btrim(l.category))
  ),
  combined AS (
    SELECT * FROM sku_agg
    UNION ALL
    SELECT * FROM cat_agg
  )
  INSERT INTO job_type_scope_stats (
    organisation_id, job_type_canonical_id, scope_kind, scope_key,
    display_label, line_bucket,
    sample_size_jobs, appearance_jobs, frequency_pct,
    median_qty, p25_qty, p75_qty, median_unit_price,
    total_appearances, refreshed_at
  )
  SELECT
    p_org, c.job_type_canonical_id, c.scope_kind, c.scope_key,
    c.display_label, c.line_bucket,
    tj.sample_size_jobs, c.appearance_jobs,
    ROUND(100.0 * c.appearance_jobs / NULLIF(tj.sample_size_jobs, 0), 2),
    c.median_qty, c.p25_qty, c.p75_qty, c.median_unit_price,
    c.total_appearances, now()
  FROM combined c
  JOIN type_jobs tj ON tj.job_type_canonical_id = c.job_type_canonical_id;

  GET DIAGNOSTICS v_scope_rows = ROW_COUNT;

  -- 2) job_type_labour_stats — billable-hours distribution per type.
  DELETE FROM job_type_labour_stats WHERE organisation_id = p_org;

  INSERT INTO job_type_labour_stats (
    organisation_id, job_type_canonical_id, sample_size_jobs,
    median_hours, p25_hours, p75_hours, mean_hours, stddev_hours,
    reliability, reliability_reason, suppress_labour_autofill, refreshed_at
  )
  SELECT
    p_org, r.job_type_canonical_id,
    COUNT(*)::int AS sample_size_jobs,
    percentile_cont(0.5)  WITHIN GROUP (ORDER BY r.charged_hours_total) AS median_hours,
    percentile_cont(0.25) WITHIN GROUP (ORDER BY r.charged_hours_total) AS p25_hours,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY r.charged_hours_total) AS p75_hours,
    AVG(r.charged_hours_total)::numeric                                  AS mean_hours,
    stddev_samp(r.charged_hours_total)::numeric                          AS stddev_hours,
    CASE
      WHEN jtc.slug IN ('insurance_inspection','logbook_service','first_service') THEN 'low'
      WHEN COUNT(*) < 30 THEN 'low'
      WHEN COUNT(*) < 100 THEN 'medium'
      ELSE 'high'
    END AS reliability,
    CASE
      WHEN jtc.slug IN ('insurance_inspection','logbook_service','first_service')
        THEN 'noisy_type_denylist:' || jtc.slug
      WHEN COUNT(*) < 30 THEN 'small_sample:n=' || COUNT(*)
      WHEN COUNT(*) < 100 THEN 'medium_sample:n=' || COUNT(*)
      ELSE 'sufficient_sample:n=' || COUNT(*)
    END AS reliability_reason,
    (jtc.category = 'insurance') AS suppress_labour_autofill,
    now()
  FROM historical_job_rollup r
  JOIN job_type_canonical jtc ON jtc.id = r.job_type_canonical_id
  WHERE r.organisation_id = p_org
    AND r.has_billable_hours = true
  GROUP BY r.job_type_canonical_id, jtc.slug, jtc.category;

  GET DIAGNOSTICS v_labour_rows = ROW_COUNT;

  -- 3) job_type_stats_reliability — bucket-share roll → three-tier flag.
  DELETE FROM job_type_stats_reliability WHERE organisation_id = p_org;

  WITH per_type AS (
    SELECT
      r.job_type_canonical_id,
      COUNT(DISTINCT r.job_number)::int                                                        AS sample_size_jobs,
      SUM(r.items_total_amount)                                                                AS total_amt,
      SUM(r.items_labour_total)                                                                AS labour_amt,
      SUM(r.items_parts_total)                                                                 AS parts_amt,
      SUM(r.items_unclassified_total)                                                          AS unclass_amt,
      SUM(r.items_rounding_total)                                                              AS round_amt
    FROM historical_job_rollup r
    WHERE r.organisation_id = p_org
    GROUP BY r.job_type_canonical_id
  )
  INSERT INTO job_type_stats_reliability (
    organisation_id, job_type_canonical_id, sample_size_jobs,
    labour_share_pct, parts_share_pct, unclassified_share_pct, rounding_share_pct,
    stats_reliability, reliability_reason, refreshed_at
  )
  SELECT
    p_org, pt.job_type_canonical_id, pt.sample_size_jobs,
    ROUND(100.0 * pt.labour_amt  / NULLIF(pt.total_amt, 0), 2) AS labour_share_pct,
    ROUND(100.0 * pt.parts_amt   / NULLIF(pt.total_amt, 0), 2) AS parts_share_pct,
    ROUND(100.0 * pt.unclass_amt / NULLIF(pt.total_amt, 0), 2) AS unclassified_share_pct,
    ROUND(100.0 * pt.round_amt   / NULLIF(pt.total_amt, 0), 2) AS rounding_share_pct,
    CASE
      -- retrieval_only: unclassified dominates, OR parts are so suppressed
      -- (warranty_work: 49.79% unclass + 12.57% parts) that SKU stats aren't
      -- the story even at sub-50% unclassified.
      WHEN pt.total_amt > 0 AND (
             100.0 * pt.unclass_amt / pt.total_amt >= 50
          OR (100.0 * pt.unclass_amt / pt.total_amt >= 40
              AND 100.0 * pt.parts_amt / pt.total_amt < 20)
        ) THEN 'retrieval_only'
      -- sku_viable: <25% unclassified — labour share is fine here, it's just
      -- "well-classified non-SKU"; what matters is the parts portion is
      -- cleanly identified, which low unclassified guarantees.
      WHEN pt.total_amt > 0
           AND 100.0 * pt.unclass_amt / pt.total_amt < 25 THEN 'sku_viable'
      -- everything else is retrieval_led (25-50% unclass band with parts >=20%)
      ELSE 'retrieval_led'
    END AS stats_reliability,
    'unclassified_share=' || COALESCE(ROUND(100.0 * pt.unclass_amt / NULLIF(pt.total_amt, 0), 1)::text, 'n/a')
      || '; parts_share=' || COALESCE(ROUND(100.0 * pt.parts_amt   / NULLIF(pt.total_amt, 0), 1)::text, 'n/a')
      || '; n='           || pt.sample_size_jobs::text
      AS reliability_reason,
    now()
  FROM per_type pt;

  GET DIAGNOSTICS v_relbl_rows = ROW_COUNT;

  -- 4) job_type_part_signals — population-level quote-freq vs invoice-freq.
  --    QUOTE side filters kind='realized' (the load-bearing filter). The
  --    rollup (invoice) side is implicitly realized.
  DELETE FROM job_type_part_signals WHERE organisation_id = p_org;

  WITH q_type_jobs AS (
    -- Denominator: distinct typed historical_quotes per type, kind='realized'.
    SELECT resolved_canonical_job_type_id AS job_type_canonical_id,
           COUNT(DISTINCT quote_number)::int AS sample_jobs
    FROM historical_quotes
    WHERE organisation_id = p_org
      AND resolved_canonical_job_type_id IS NOT NULL
      AND kind = 'realized'
    GROUP BY resolved_canonical_job_type_id
  ),
  q_sku AS (
    SELECT
      q.resolved_canonical_job_type_id AS job_type_canonical_id,
      'sku'::text                      AS scope_kind,
      qi.stock_number                  AS scope_key,
      mode() WITHIN GROUP (ORDER BY qi.stock_name) AS display_label,
      COUNT(DISTINCT q.quote_number)::int AS appearance_jobs
    FROM historical_quote_items qi
    JOIN historical_quotes q
      ON q.organisation_id = qi.organisation_id
     AND q.quote_number    = qi.quote_number
    WHERE qi.organisation_id = p_org
      AND q.resolved_canonical_job_type_id IS NOT NULL
      AND q.kind = 'realized'
      AND qi.stock_number IS NOT NULL
      AND qi.stock_number <> ''
    GROUP BY q.resolved_canonical_job_type_id, qi.stock_number
  ),
  q_cat AS (
    SELECT
      q.resolved_canonical_job_type_id AS job_type_canonical_id,
      'category'::text                 AS scope_kind,
      lower(btrim(qi.category))        AS scope_key,
      mode() WITHIN GROUP (ORDER BY qi.category) AS display_label,
      COUNT(DISTINCT q.quote_number)::int AS appearance_jobs
    FROM historical_quote_items qi
    JOIN historical_quotes q
      ON q.organisation_id = qi.organisation_id
     AND q.quote_number    = qi.quote_number
    WHERE qi.organisation_id = p_org
      AND q.resolved_canonical_job_type_id IS NOT NULL
      AND q.kind = 'realized'
      AND qi.category IS NOT NULL
      AND btrim(qi.category) <> ''
    GROUP BY q.resolved_canonical_job_type_id, lower(btrim(qi.category))
  ),
  i_type_jobs AS (
    -- Denominator: distinct typed historical_job_rollup rows per type.
    SELECT job_type_canonical_id, COUNT(DISTINCT job_number)::int AS sample_jobs
    FROM historical_job_rollup
    WHERE organisation_id = p_org
    GROUP BY job_type_canonical_id
  ),
  i_sku AS (
    SELECT
      l.job_type_canonical_id,
      'sku'::text     AS scope_kind,
      l.stock_number  AS scope_key,
      mode() WITHIN GROUP (ORDER BY l.stock_name) AS display_label,
      COUNT(DISTINCT l.job_number)::int           AS appearance_jobs
    FROM historical_job_rollup_lines l
    WHERE l.organisation_id = p_org
      AND l.stock_number IS NOT NULL
      AND l.stock_number <> ''
    GROUP BY l.job_type_canonical_id, l.stock_number
  ),
  i_cat AS (
    SELECT
      l.job_type_canonical_id,
      'category'::text          AS scope_kind,
      lower(btrim(l.category))  AS scope_key,
      mode() WITHIN GROUP (ORDER BY l.category) AS display_label,
      COUNT(DISTINCT l.job_number)::int         AS appearance_jobs
    FROM historical_job_rollup_lines l
    WHERE l.organisation_id = p_org
      AND l.category IS NOT NULL
      AND btrim(l.category) <> ''
    GROUP BY l.job_type_canonical_id, lower(btrim(l.category))
  ),
  q_all  AS (SELECT * FROM q_sku UNION ALL SELECT * FROM q_cat),
  i_all  AS (SELECT * FROM i_sku UNION ALL SELECT * FROM i_cat),
  joined AS (
    -- FULL OUTER so SKUs that appear only quote-side OR only invoice-side
    -- still produce a row (delta will be -100 / +100 respectively).
    SELECT
      COALESCE(q.job_type_canonical_id, i.job_type_canonical_id) AS job_type_canonical_id,
      COALESCE(q.scope_kind, i.scope_kind)                       AS scope_kind,
      COALESCE(q.scope_key,  i.scope_key)                        AS scope_key,
      COALESCE(q.display_label, i.display_label)                 AS display_label,
      COALESCE(q.appearance_jobs, 0)                             AS q_app,
      COALESCE(i.appearance_jobs, 0)                             AS i_app
    FROM q_all q
    FULL OUTER JOIN i_all i
      ON i.job_type_canonical_id = q.job_type_canonical_id
     AND i.scope_kind            = q.scope_kind
     AND i.scope_key              = q.scope_key
  ),
  with_rates AS (
    SELECT
      j.*,
      COALESCE(qtj.sample_jobs, 0) AS q_sample,
      COALESCE(itj.sample_jobs, 0) AS i_sample,
      CASE WHEN COALESCE(qtj.sample_jobs, 0) > 0
           THEN ROUND(100.0 * j.q_app / qtj.sample_jobs, 2) ELSE 0 END AS quote_freq_pct,
      CASE WHEN COALESCE(itj.sample_jobs, 0) > 0
           THEN ROUND(100.0 * j.i_app / itj.sample_jobs, 2) ELSE 0 END AS invoice_freq_pct
    FROM joined j
    LEFT JOIN q_type_jobs qtj ON qtj.job_type_canonical_id = j.job_type_canonical_id
    LEFT JOIN i_type_jobs itj ON itj.job_type_canonical_id = j.job_type_canonical_id
  ),
  classified AS (
    SELECT
      wr.*,
      (wr.invoice_freq_pct - wr.quote_freq_pct) AS delta_pct,
      -- Lookup: does this scope appear in THIS type's scope_stats with freq >=30%?
      EXISTS (
        SELECT 1 FROM job_type_scope_stats s
        WHERE s.organisation_id = p_org
          AND s.job_type_canonical_id = wr.job_type_canonical_id
          AND s.scope_kind            = wr.scope_kind
          AND s.scope_key             = wr.scope_key
          AND s.frequency_pct        >= 30
      ) AS in_our_base,
      -- Lookup: is this scope a core (freq >=50%) in some OTHER type?
      EXISTS (
        SELECT 1 FROM job_type_scope_stats s
        WHERE s.organisation_id = p_org
          AND s.job_type_canonical_id <> wr.job_type_canonical_id
          AND s.scope_kind             = wr.scope_kind
          AND s.scope_key              = wr.scope_key
          AND s.frequency_pct         >= 50
      ) AS core_elsewhere,
      EXISTS (
        SELECT 1 FROM draft_excluded_skus dx
        WHERE dx.organisation_id = p_org
          AND dx.scope_kind      = wr.scope_kind
          AND dx.scope_key       = wr.scope_key
      ) AS denylisted
    FROM with_rates wr
  )
  INSERT INTO job_type_part_signals (
    organisation_id, job_type_canonical_id, scope_kind, scope_key, display_label,
    quote_sample_jobs, quote_appearance_jobs, quote_freq_pct,
    invoice_sample_jobs, invoice_appearance_jobs, invoice_freq_pct,
    delta_pct, classification, classification_reason, refreshed_at
  )
  SELECT
    p_org, c.job_type_canonical_id, c.scope_kind, c.scope_key, c.display_label,
    c.q_sample, c.q_app, c.quote_freq_pct,
    c.i_sample, c.i_app, c.invoice_freq_pct,
    c.delta_pct,
    CASE
      WHEN c.denylisted                                         THEN 'noise'
      WHEN c.i_app < 3 AND c.q_app < 3                          THEN 'noise'
      WHEN c.delta_pct >= 15 AND c.invoice_freq_pct >= 30 AND c.in_our_base    THEN 'correction'
      WHEN c.delta_pct >= 15 AND c.invoice_freq_pct >= 20 AND c.core_elsewhere THEN 'cross_sell'
      ELSE 'core_aligned'
    END AS classification,
    CASE
      WHEN c.denylisted             THEN 'denylist'
      WHEN c.i_app < 3 AND c.q_app < 3 THEN 'undersampled:i=' || c.i_app || ',q=' || c.q_app
      WHEN c.delta_pct >= 15 AND c.invoice_freq_pct >= 30 AND c.in_our_base
        THEN 'invoice>>quote_in_base:delta=' || c.delta_pct
      WHEN c.delta_pct >= 15 AND c.invoice_freq_pct >= 20 AND c.core_elsewhere
        THEN 'invoice>>quote_core_elsewhere:delta=' || c.delta_pct
      ELSE 'core_aligned:delta=' || c.delta_pct
    END AS classification_reason,
    now()
  FROM classified c;

  GET DIAGNOSTICS v_signal_rows = ROW_COUNT;

  -- 5) Recency-tier extension on sku_price_stats.
  v_sku_rows := refresh_sku_price_stats(p_org);

  RETURN jsonb_build_object(
    'scope_rows',       v_scope_rows,
    'labour_rows',      v_labour_rows,
    'reliability_rows', v_relbl_rows,
    'signal_rows',      v_signal_rows,
    'sku_rows',         v_sku_rows
  );
END
$$;

COMMENT ON FUNCTION refresh_job_type_stats(uuid) IS
  'Rebuilds Layer 2 for one org: job_type_scope_stats, job_type_labour_stats, '
  'job_type_stats_reliability, job_type_part_signals (kind=''realized'' filter '
  'on quote side), and refreshes sku_price_stats recency tiers. Idempotent. '
  'Returns row counts as jsonb.';

REVOKE ALL ON FUNCTION refresh_job_type_stats(uuid) FROM public;

-- ============================================================================
-- L. Populate Carafix.
-- ============================================================================
-- Rollup must be re-refreshed first because its search_* columns are new.
SELECT refresh_job_rollup('00000000-0000-0000-0000-000000000002'::uuid);
SELECT refresh_job_type_stats('00000000-0000-0000-0000-000000000002'::uuid);

COMMIT;
