-- 0032 — historical_job_rollup (Step 4d Phase 1)
--
-- Layer 1 of the 4d data spine. Collapses the four historical grains
-- (historical_jobs / historical_invoices / historical_invoice_items /
-- historical_timesheets) into:
--
--   1. historical_job_rollup        — one row per typed historical job
--                                     (job_type_canonical_id IS NOT NULL),
--                                     carrying van/customer/totals/provenance.
--   2. historical_job_rollup_lines  — one row per historical_invoice_items row
--                                     belonging to a typed job's invoice,
--                                     with bucket classification baked in.
--                                     Phase 2's per-(type × SKU) stats and
--                                     signal computations read from here.
--
-- Refresh model (v1): manual, via refresh_job_rollup(p_org). Called once at
-- the end of this migration so the tables land populated. Live jobs are NOT
-- written here yet (the flywheel) — the shape admits them later.
--
-- Idempotency: refresh_job_rollup deletes the org's rollup rows (CASCADE
-- drops the org's line rows) and rebuilds in a single transaction.
-- Re-running yields a byte-equivalent rebuild (modulo refreshed_at).
--
-- Van source. historical_invoices.vehicle_make / vehicle_model are 100% NULL
-- across the corpus; historical_jobs.vehicle_external_id is 0% populated on
-- typed jobs. The only working van path is
--   historical_jobs.vehicle_number  →  historical_vehicles.vehicle_number
-- which resolves all 2,128 typed jobs (make 91%, model 76%, year ~0%).
-- van_year is kept (text in source) despite near-100% nulls — live jobs
-- will populate it.
--
-- Item bucketing. The CASE classifier lives in both INSERTs below (parent
-- aggregates + child lines). If you change one, change the other — they
-- MUST stay in lockstep. Buckets are deliberately transparent:
--   labour       → category = 'LABOUR'
--   rounding     → stock_number = 'ROUNDING'   (noise; excluded from totals' parts/labour split)
--   parts        → category IS NOT NULL AND not labour AND not rounding
--   unclassified → category IS NULL AND not rounding
-- The unclassified bucket (NULL category) is a known mix of ad-hoc labour
-- and un-categorised parts — Phase 2's job_type_part_signals work classifies
-- it; Layer 1 doesn't guess.

BEGIN;

-- ---------------------------------------------------------------------------
-- historical_job_rollup — one row per typed historical job
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS historical_job_rollup (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id             uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  job_number                  text NOT NULL,

  -- Canonical type (Phase 0 output) — denormalised name/slug/category so
  -- Phase 2 stats can group without a second join.
  job_type_canonical_id       uuid NOT NULL REFERENCES job_type_canonical(id),
  job_type_slug               text,
  job_type_name               text,
  job_type_category           text,

  -- Job header
  description                 text,
  job_type_raw                text,
  estimate_hours              numeric,
  job_start_time              timestamptz,
  job_finish_time             timestamptz,
  job_status                  text,

  -- Van (resolved via vehicle_number → historical_vehicles)
  vehicle_number              text,
  vehicle_external_id         text,
  van_make                    text,
  van_model                   text,
  van_year                    text,
  registration_number         text,

  -- Customer
  customer_external_id        text,
  customer_number             text,
  customer_name               text,

  -- Hours (timesheets, billable only — excludes is_internal_no_charge)
  charged_hours_total         numeric,
  charged_hours_internal      numeric,
  amount_charged_total        numeric,
  timesheet_count             int,
  timesheet_count_billable    int,

  -- Invoice header (1:1 with job for typed jobs — verified empirically)
  invoice_id                  uuid,
  invoice_number              text,
  invoice_issue_date          date,
  invoice_net_amount          numeric,
  invoice_total_amount        numeric,
  invoice_total_cost          numeric,

  -- Item rolls (computed from invoice items; equal to invoice totals to ≤$0.01)
  items_count                 int  NOT NULL DEFAULT 0,
  items_total_amount          numeric NOT NULL DEFAULT 0,
  items_net_amount            numeric NOT NULL DEFAULT 0,
  items_cogs                  numeric NOT NULL DEFAULT 0,

  -- Bucketed rolls — sum to items_total_amount.
  items_labour_total          numeric NOT NULL DEFAULT 0,
  items_labour_count          int     NOT NULL DEFAULT 0,
  items_parts_total           numeric NOT NULL DEFAULT 0,
  items_parts_count           int     NOT NULL DEFAULT 0,
  items_unclassified_total    numeric NOT NULL DEFAULT 0,
  items_unclassified_count    int     NOT NULL DEFAULT 0,
  items_rounding_total        numeric NOT NULL DEFAULT 0,
  items_rounding_count        int     NOT NULL DEFAULT 0,

  -- Provenance flags (drive Layer 2's "stats only over jobs with X" filters)
  has_invoice                 boolean NOT NULL DEFAULT false,
  has_timesheets              boolean NOT NULL DEFAULT false,
  has_billable_hours          boolean NOT NULL DEFAULT false,

  refreshed_at                timestamptz NOT NULL DEFAULT now(),

  UNIQUE (organisation_id, job_number)
);

CREATE INDEX IF NOT EXISTS idx_job_rollup_org_type
  ON historical_job_rollup (organisation_id, job_type_canonical_id);

CREATE INDEX IF NOT EXISTS idx_job_rollup_org_van
  ON historical_job_rollup (organisation_id, van_make, van_model);

CREATE INDEX IF NOT EXISTS idx_job_rollup_org_invoice
  ON historical_job_rollup (organisation_id, invoice_id);

COMMENT ON TABLE historical_job_rollup IS
  'Layer 1 of Step 4d. One row per typed historical job, aggregating the four '
  'historical grains. Refreshed manually via refresh_job_rollup(p_org). v1 '
  'reads historical_* only; live jobs admit later (the flywheel).';

ALTER TABLE historical_job_rollup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_rollup_select_org" ON historical_job_rollup
  FOR SELECT USING (organisation_id = current_user_org_id());

-- ---------------------------------------------------------------------------
-- historical_job_rollup_lines — one row per invoice item on a typed job
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS historical_job_rollup_lines (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id         uuid NOT NULL,
  job_number              text NOT NULL,

  -- Denormalised type so Phase 2 per-(type × SKU) stats query lines directly.
  job_type_canonical_id   uuid NOT NULL REFERENCES job_type_canonical(id),
  job_type_slug           text,

  invoice_id              uuid NOT NULL,
  source_item_id          uuid NOT NULL,    -- historical_invoice_items.id (audit / dedup)

  -- Raw line fields preserved
  stock_number            text,
  stock_name              text,
  category                text,
  description             text,
  quantity                numeric,
  unit_price              numeric,
  unit_cost               numeric,
  net_amount              numeric,
  tax_amount              numeric,
  total_amount            numeric,
  cogs                    numeric,
  discount_percentage     numeric,

  -- Bucket classified once, at refresh time. Keep in lockstep with the parent.
  line_bucket             text NOT NULL
    CHECK (line_bucket IN ('labour','parts','unclassified','rounding')),

  refreshed_at            timestamptz NOT NULL DEFAULT now(),

  FOREIGN KEY (organisation_id, job_number)
    REFERENCES historical_job_rollup (organisation_id, job_number)
    ON DELETE CASCADE
);

-- Phase 2 read paths: per-(type × SKU) stats and per-(type × bucket) rolls.
CREATE INDEX IF NOT EXISTS idx_rollup_lines_org_type_sku
  ON historical_job_rollup_lines (organisation_id, job_type_canonical_id, stock_number);

CREATE INDEX IF NOT EXISTS idx_rollup_lines_org_type_bucket
  ON historical_job_rollup_lines (organisation_id, job_type_canonical_id, line_bucket);

CREATE INDEX IF NOT EXISTS idx_rollup_lines_org_job
  ON historical_job_rollup_lines (organisation_id, job_number);

COMMENT ON TABLE historical_job_rollup_lines IS
  'Per-line companion to historical_job_rollup. One row per historical_invoice_items '
  'row belonging to a typed job''s invoice, with bucket classification baked in. '
  'Read by Phase 2 stats (job_type_part_signals, recency-weighted sku_price_stats).';

ALTER TABLE historical_job_rollup_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_rollup_lines_select_org" ON historical_job_rollup_lines
  FOR SELECT USING (organisation_id = current_user_org_id());

-- ---------------------------------------------------------------------------
-- refresh_job_rollup(p_org)
--
-- Org-scoped, idempotent rebuild. Returns number of rollup rows written.
-- The line-level bucket CASE is duplicated in both INSERTs and MUST stay in
-- sync with the per-job rolls.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_job_rollup(p_org uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows int := 0;
BEGIN
  -- CASCADE on the FK drops the org's rollup_lines automatically.
  DELETE FROM historical_job_rollup WHERE organisation_id = p_org;

  -- 1) Parent rollup. One row per typed job (LEFT joins keep jobs with no
  --    invoice, no timesheets, or unresolved vehicle).
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
    j.organisation_id,
    j.job_number,
    j.job_type_canonical_id,
    jtc.slug, jtc.name, jtc.category,
    j.description, j.job_type_raw, j.estimate_hours,
    j.start_time, j.finish_time, j.status,
    j.vehicle_number,
    v.external_id,
    v.make, v.model, v.year,
    COALESCE(j.registration_number, v.registration_number),
    j.customer_external_id, j.customer_number, j.customer_name,
    COALESCE(ts.billable_hours, 0),
    COALESCE(ts.internal_hours, 0),
    COALESCE(ts.billable_amount, 0),
    COALESCE(ts.ts_count, 0),
    COALESCE(ts.ts_count_billable, 0),
    i.id, i.invoice_number, i.issue_date,
    i.net_amount, i.total_amount, i.total_cost,
    COALESCE(it.items_count, 0),
    COALESCE(it.items_total, 0),
    COALESCE(it.items_net, 0),
    COALESCE(it.items_cogs, 0),
    COALESCE(it.labour_total, 0),
    COALESCE(it.labour_count, 0),
    COALESCE(it.parts_total, 0),
    COALESCE(it.parts_count, 0),
    COALESCE(it.unclass_total, 0),
    COALESCE(it.unclass_count, 0),
    COALESCE(it.round_total, 0),
    COALESCE(it.round_count, 0),
    (i.id IS NOT NULL),
    (COALESCE(ts.ts_count, 0) > 0),
    (COALESCE(ts.billable_hours, 0) > 0),
    now()
  FROM historical_jobs j
  LEFT JOIN job_type_canonical jtc
    ON jtc.id = j.job_type_canonical_id
  LEFT JOIN historical_vehicles v
    ON v.organisation_id = j.organisation_id
   AND v.vehicle_number  = j.vehicle_number
  LEFT JOIN historical_invoices i
    ON i.organisation_id = j.organisation_id
   AND i.job_number      = j.job_number
  LEFT JOIN LATERAL (
    SELECT
      SUM(total_amount) FILTER (WHERE category = 'LABOUR')                              AS labour_total,
      COUNT(*)          FILTER (WHERE category = 'LABOUR')                              AS labour_count,
      SUM(total_amount) FILTER (WHERE category IS NOT NULL
                                  AND category <> 'LABOUR'
                                  AND COALESCE(stock_number, '') <> 'ROUNDING')         AS parts_total,
      COUNT(*)          FILTER (WHERE category IS NOT NULL
                                  AND category <> 'LABOUR'
                                  AND COALESCE(stock_number, '') <> 'ROUNDING')         AS parts_count,
      SUM(total_amount) FILTER (WHERE category IS NULL
                                  AND COALESCE(stock_number, '') <> 'ROUNDING')         AS unclass_total,
      COUNT(*)          FILTER (WHERE category IS NULL
                                  AND COALESCE(stock_number, '') <> 'ROUNDING')         AS unclass_count,
      SUM(total_amount) FILTER (WHERE COALESCE(stock_number, '') = 'ROUNDING')          AS round_total,
      COUNT(*)          FILTER (WHERE COALESCE(stock_number, '') = 'ROUNDING')          AS round_count,
      SUM(total_amount)                                                                  AS items_total,
      SUM(net_amount)                                                                    AS items_net,
      SUM(cogs)                                                                          AS items_cogs,
      COUNT(*)                                                                           AS items_count
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
    WHERE ts.organisation_id = j.organisation_id
      AND ts.job_number      = j.job_number
  ) ts ON TRUE
  WHERE j.organisation_id = p_org
    AND j.job_type_canonical_id IS NOT NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- 2) Child line rows. Only typed jobs that have an invoice produce lines.
  --    Bucket CASE here MUST mirror the FILTERed aggregates above.
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
    j.organisation_id,
    j.job_number,
    j.job_type_canonical_id,
    jtc.slug,
    i.id,
    it.id,
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
  JOIN job_type_canonical jtc      ON jtc.id = j.job_type_canonical_id
  JOIN historical_invoices i
    ON i.organisation_id = j.organisation_id
   AND i.job_number      = j.job_number
  JOIN historical_invoice_items it ON it.invoice_id = i.id
  WHERE j.organisation_id = p_org
    AND j.job_type_canonical_id IS NOT NULL;

  RETURN v_rows;
END
$$;

COMMENT ON FUNCTION refresh_job_rollup(uuid) IS
  'Rebuilds historical_job_rollup (and cascades historical_job_rollup_lines) '
  'for one org. Returns number of parent rows written. Idempotent.';

REVOKE ALL ON FUNCTION refresh_job_rollup(uuid) FROM public;

-- ---------------------------------------------------------------------------
-- Populate Carafix (the project's single live tenant; matches 0029 precedent).
-- ---------------------------------------------------------------------------
SELECT refresh_job_rollup('00000000-0000-0000-0000-000000000002'::uuid);

COMMIT;
