-- Category-specific fields + v1 work type, and make the hidden task's skill
-- optional.
--
-- work_type is orthogonal to the existing job `category`: a job can be
-- "Service + Insurance" or "Repair + Private" without redundancy. The granular
-- `skills` / `technician_skills` tables stay untouched for v1.5.

create type work_type as enum (
  'Service',
  'Repair',
  'Pre-purchase inspection',
  'Modification',
  'Other'
);

alter table jobs
  add column insurance_claim_number text,
  add column warranty_reference text,            -- chassis number or rego, free text
  add column work_type work_type;

-- v1 hides tasks and ignores granular skills, so the auto-created hidden task
-- no longer requires a skill. The sync_primary_task trigger already passes
-- jobs.primary_skill_id (nullable) straight through. v1.5 re-tightens this when
-- skill tagging ships.
alter table tasks alter column skill_id drop not null;
