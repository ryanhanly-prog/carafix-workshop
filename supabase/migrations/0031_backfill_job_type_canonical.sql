-- 0031 — Backfill job_type_canonical_id (Step 4d Phase 0)
--
-- Populates job_type_canonical_id on historical_jobs and historical_invoices
-- by resolving each row's raw job-type text through job_type_aliases. Then
-- extends historical_quotes.resolved_canonical_job_type_id by copying the
-- canonical id from the nearest same-customer historical_jobs or
-- historical_invoices row (the same transitive logic used in 0023, applied
-- only to currently-unresolved quotes).
--
-- Resolution rule (jobs/invoices):
--   lower(btrim(raw_text)) = lower(btrim(job_type_aliases.raw_value))
--   within the same organisation, where canonical_id IS NOT NULL.
--
-- Idempotent: only updates rows whose canonical id is currently NULL and
-- whose raw text is non-empty. Re-running is a no-op unless new alias rows
-- have been added since the last run.
--
-- Reversible (per table): clear the column with
--   UPDATE historical_jobs     SET job_type_canonical_id = NULL WHERE organisation_id = :org;
--   UPDATE historical_invoices SET job_type_canonical_id = NULL WHERE organisation_id = :org;
-- (historical_quotes had a pre-existing partial backfill from 0023; do not
-- blanket-null its column.)

BEGIN;

-- 1) historical_jobs ← alias map on job_type_raw
UPDATE historical_jobs hj
SET    job_type_canonical_id = a.canonical_id
FROM   job_type_aliases a
WHERE  a.organisation_id = hj.organisation_id
  AND  lower(btrim(a.raw_value)) = lower(btrim(hj.job_type_raw))
  AND  a.canonical_id IS NOT NULL
  AND  hj.job_type_canonical_id IS NULL
  AND  nullif(btrim(hj.job_type_raw), '') IS NOT NULL;

-- 2) historical_invoices ← alias map on first_job_type
UPDATE historical_invoices hi
SET    job_type_canonical_id = a.canonical_id
FROM   job_type_aliases a
WHERE  a.organisation_id = hi.organisation_id
  AND  lower(btrim(a.raw_value)) = lower(btrim(hi.first_job_type))
  AND  a.canonical_id IS NOT NULL
  AND  hi.job_type_canonical_id IS NULL
  AND  nullif(btrim(hi.first_job_type), '') IS NOT NULL;

-- 3) historical_quotes ← nearest same-customer historical_jobs (±90 days),
--    falling back to nearest same-customer historical_invoices (±90 days).
--    Only updates rows where resolved_canonical_job_type_id IS NULL, and
--    only writes a non-null result (no destructive overwrite).
UPDATE historical_quotes hq
SET    resolved_canonical_job_type_id = sub.canonical_id
FROM (
  SELECT hq2.id,
         COALESCE(
           (SELECT j.job_type_canonical_id
              FROM historical_jobs j
             WHERE j.organisation_id = hq2.organisation_id
               AND j.customer_external_id = hq2.customer_external_id
               AND j.job_type_canonical_id IS NOT NULL
               AND j.created_date IS NOT NULL
               AND hq2.issue_date IS NOT NULL
               AND abs(j.created_date - hq2.issue_date) <= 90
             ORDER BY abs(j.created_date - hq2.issue_date)
             LIMIT 1),
           (SELECT i.job_type_canonical_id
              FROM historical_invoices i
             WHERE i.organisation_id = hq2.organisation_id
               AND i.customer_external_id = hq2.customer_external_id
               AND i.job_type_canonical_id IS NOT NULL
               AND i.issue_date IS NOT NULL
               AND hq2.issue_date IS NOT NULL
               AND abs(i.issue_date - hq2.issue_date) <= 90
             ORDER BY abs(i.issue_date - hq2.issue_date)
             LIMIT 1)
         ) AS canonical_id
    FROM historical_quotes hq2
   WHERE hq2.resolved_canonical_job_type_id IS NULL
     AND hq2.customer_external_id IS NOT NULL
) sub
WHERE hq.id = sub.id
  AND sub.canonical_id IS NOT NULL
  AND hq.resolved_canonical_job_type_id IS NULL;

COMMIT;
