-- Step 3.6a: job-type taxonomy. A canonical (clean) list plus an alias layer that
-- maps the inconsistent raw Mechanic Desk "Job Type" / "First Job Type" labels onto
-- it. Powers Step 4's hours-suggester.

create table job_type_canonical (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  slug text not null,
  name text not null,
  category text,
  description text,
  active boolean default true,
  display_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (organisation_id, slug)
);

create table job_type_aliases (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  raw_value text not null,
  canonical_id uuid references job_type_canonical(id) on delete set null,
  occurrence_count int default 0,
  last_seen timestamptz default now(),
  created_at timestamptz default now(),
  -- Import-computed suggestion (string similarity); never auto-applied.
  suggested_canonical_id uuid references job_type_canonical(id),
  suggestion_confidence numeric,
  unique (organisation_id, raw_value)
);

create index idx_job_type_aliases_canonical on job_type_aliases(canonical_id);
create index idx_job_type_aliases_unmapped on job_type_aliases(organisation_id) where canonical_id is null;

alter table job_type_canonical enable row level security;
alter table job_type_aliases enable row level security;

create policy "users see canonical types in their org" on job_type_canonical
  for all using (organisation_id = current_user_org_id())
  with check (organisation_id = current_user_org_id());

create policy "users see aliases in their org" on job_type_aliases
  for all using (organisation_id = current_user_org_id())
  with check (organisation_id = current_user_org_id());

-- keep updated_at fresh (set_updated_at from 0017)
drop trigger if exists trg_job_type_canonical_updated_at on job_type_canonical;
create trigger trg_job_type_canonical_updated_at
  before update on job_type_canonical
  for each row execute function set_updated_at();

-- Seed Carafix's canonical list (idempotent). Catherine can rename/add/deactivate.
insert into job_type_canonical (organisation_id, slug, name, category, display_order) values
  ('00000000-0000-0000-0000-000000000002', 'tandem_axle_service',    'Tandem Axle Service',       'service',    10),
  ('00000000-0000-0000-0000-000000000002', 'single_axle_service',    'Single Axle Service',       'service',    20),
  ('00000000-0000-0000-0000-000000000002', 'first_service',          'First Service',             'service',    30),
  ('00000000-0000-0000-0000-000000000002', 'annual_service',         'Annual / 12-Month Service', 'service',    40),
  ('00000000-0000-0000-0000-000000000002', 'logbook_service',        'Logbook Service',           'service',    50),
  ('00000000-0000-0000-0000-000000000002', 'slide_out_service',      'Slide Out Service',         'service',    60),
  ('00000000-0000-0000-0000-000000000002', 'insurance_inspection',   'Insurance Inspection',      'insurance',  70),
  ('00000000-0000-0000-0000-000000000002', 'insurance_repair',       'Insurance Repair',          'insurance',  80),
  ('00000000-0000-0000-0000-000000000002', 'storm_damage',           'Storm Damage Repair',       'insurance',  90),
  ('00000000-0000-0000-0000-000000000002', 'impact_damage',          'Impact / Collision Repair', 'insurance', 100),
  ('00000000-0000-0000-0000-000000000002', 'water_damage',           'Water Damage / Leak Repair','repair',    110),
  ('00000000-0000-0000-0000-000000000002', 'awning_repair',          'Awning Repair / Replace',   'repair',    120),
  ('00000000-0000-0000-0000-000000000002', 'electrical_repair',      'Electrical Repair',         'repair',    130),
  ('00000000-0000-0000-0000-000000000002', 'plumbing_gas_repair',    'Plumbing / Gas Repair',     'repair',    140),
  ('00000000-0000-0000-0000-000000000002', 'chassis_suspension',     'Chassis / Suspension',      'repair',    150),
  ('00000000-0000-0000-0000-000000000002', 'pre_purchase_inspection','Pre-Purchase Inspection',   'inspection',160),
  ('00000000-0000-0000-0000-000000000002', 'warranty_work',          'Warranty Work',             'warranty',  170),
  ('00000000-0000-0000-0000-000000000002', 'upgrade_install',        'Upgrade / Installation',    'upgrade',   180),
  ('00000000-0000-0000-0000-000000000002', 'other',                  'Other',                     'other',     999)
on conflict (organisation_id, slug) do nothing;

-- B5 helper: resolve a raw label to its canonical id (NULL if unmapped). Used by
-- Step 4's hours-suggester. Plain stable (respects RLS via current_user_org_id()).
create or replace function canonical_job_type(raw_text text)
returns uuid
language sql
stable
set search_path = public
as $$
  select canonical_id
  from job_type_aliases
  where organisation_id = current_user_org_id()
    and raw_value = raw_text
$$;
