-- Step 3d: external_id on customers, so Mechanic Desk customers can be matched
-- and re-imported idempotently by their MD UUID.
--
-- The prompt suggested a PARTIAL unique index (where external_id is not null),
-- but PostgREST .upsert(onConflict: 'organisation_id,external_id') cannot use a
-- partial index as a conflict arbiter (it does not emit the index predicate). A
-- full unique constraint works as the arbiter, and because NULLs are distinct in
-- a UNIQUE constraint the existing demo customers (external_id IS NULL) are
-- unaffected and can coexist freely.

alter table customers add column if not exists external_id text;

alter table customers
  add constraint customers_org_external_unique unique (organisation_id, external_id);
