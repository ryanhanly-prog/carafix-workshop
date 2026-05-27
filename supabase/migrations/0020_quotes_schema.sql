-- Step 4a: live quote drafting schema.
--
-- Decisions (confirmed): quotes.vehicle_id -> vans (live vehicle registry, strict
-- FK). The "parts master" is stock_items (NOT the job-scoped parts table); part
-- lines reference stock_items and silent_save_part writes stubs there.
-- cloned_from_quote_id is a polymorphic soft reference (live quotes OR
-- historical_quotes), disambiguated by cloned_from_source, so it has no FK.

-- ----------------------------------------------------------------------------
-- insurers
-- ----------------------------------------------------------------------------
create table insurers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  name text not null,
  capped_labour_rate numeric not null,
  notes text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index insurers_org_name_active_unique
  on insurers(organisation_id, name) where is_active = true;
create index idx_insurers_org on insurers(organisation_id);

-- ----------------------------------------------------------------------------
-- job_type_defaults (one row per canonical type)
-- ----------------------------------------------------------------------------
create table job_type_defaults (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  canonical_job_type_id uuid not null references job_type_canonical(id),
  labour_rate_source text not null
    check (labour_rate_source in ('insurer_capped','workshop_retail','jayco_published','cost_only')),
  workshop_retail_rate numeric,
  markup_floor_pct numeric default 0,
  markup_default_pct numeric default 0,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (organisation_id, canonical_job_type_id)
);

-- Seed all 19 Carafix canonical types by category.
insert into job_type_defaults
  (organisation_id, canonical_job_type_id, labour_rate_source, workshop_retail_rate, markup_floor_pct, markup_default_pct)
select
  c.organisation_id,
  c.id,
  case c.category when 'insurance' then 'insurer_capped'
                  when 'other'     then 'cost_only'
                  else 'workshop_retail' end,
  case when c.category in ('service','repair','inspection','upgrade','warranty') then 140.91 end,
  case c.category when 'insurance' then 40
                  when 'service' then 30 when 'repair' then 30
                  when 'inspection' then 30 when 'upgrade' then 30
                  else 0 end,
  case c.category when 'insurance' then 50
                  when 'service' then 40 when 'repair' then 40
                  when 'inspection' then 40 when 'upgrade' then 40
                  else 0 end
from job_type_canonical c
where c.organisation_id = '00000000-0000-0000-0000-000000000002'
on conflict (organisation_id, canonical_job_type_id) do nothing;

-- ----------------------------------------------------------------------------
-- quotes
-- ----------------------------------------------------------------------------
create table quotes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  quote_number text,
  customer_id uuid references customers(id),
  vehicle_id uuid references vans(id),
  canonical_job_type_id uuid not null references job_type_canonical(id),
  insurer_id uuid references insurers(id),
  status text not null default 'draft'
    check (status in ('draft','sent','approved','rejected','converted_to_job','cancelled')),
  description text,
  damage_tags text[],
  subtotal_parts numeric default 0,
  subtotal_labour numeric default 0,
  subtotal_consumables numeric default 0,
  subtotal_other numeric default 0,
  total numeric default 0,
  cloned_from_quote_id uuid,   -- polymorphic soft ref; see cloned_from_source
  cloned_from_source text check (cloned_from_source in ('live','historical')),
  sent_at timestamptz,
  notes text,
  created_by uuid references app_users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (organisation_id, quote_number)
);
create index idx_quotes_org_status on quotes(organisation_id, status);
create index idx_quotes_org_jobtype on quotes(organisation_id, canonical_job_type_id);
create index idx_quotes_org_customer on quotes(organisation_id, customer_id);

-- ----------------------------------------------------------------------------
-- quote_line_items
-- ----------------------------------------------------------------------------
create table quote_line_items (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  quote_id uuid not null references quotes(id) on delete cascade,
  line_order int not null,
  line_type text not null check (line_type in ('part','labour','consumable','freight','other')),
  part_id uuid references stock_items(id),
  supplier_id uuid references suppliers(id),
  description text not null,
  quantity numeric default 1,
  unit text,
  unit_cost numeric default 0,
  markup_pct numeric default 0,
  unit_price numeric default 0,
  line_total numeric default 0,
  source text not null default 'manual' check (source in ('manual','cloned','suggested')),
  source_quote_line_id uuid,   -- soft ref to source line (live or historical)
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_qli_quote on quote_line_items(quote_id, line_order);
create index idx_qli_org on quote_line_items(organisation_id);

-- ----------------------------------------------------------------------------
-- quote_sequences (per-tenant numbering; first number = 100001)
-- ----------------------------------------------------------------------------
create table quote_sequences (
  organisation_id uuid primary key references organisations(id),
  last_number int not null default 100000
);

-- ----------------------------------------------------------------------------
-- config_audit_log
-- ----------------------------------------------------------------------------
create table config_audit_log (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  entity_type text not null,
  entity_id uuid not null,
  action text not null check (action in ('create','update','delete','activate','deactivate')),
  changed_fields jsonb,
  changed_by uuid references app_users(id),
  changed_at timestamptz default now()
);
create index idx_audit_org_changed on config_audit_log(organisation_id, changed_at desc);
create index idx_audit_org_entity on config_audit_log(organisation_id, entity_type);

-- ----------------------------------------------------------------------------
-- parts-master additions on stock_items
-- ----------------------------------------------------------------------------
alter table stock_items add column auto_created boolean default false;

-- ----------------------------------------------------------------------------
-- historical_quotes resolved canonical job type (backfill: no reliable join key
-- on historical_quotes -> jobs/invoices in this data, so it stays NULL; similarity
-- still works on make/model/description).
-- ----------------------------------------------------------------------------
alter table historical_quotes add column resolved_canonical_job_type_id uuid references job_type_canonical(id);

-- ----------------------------------------------------------------------------
-- updated_at maintenance (set_updated_at from 0017)
-- ----------------------------------------------------------------------------
create trigger trg_insurers_updated_at before update on insurers
  for each row execute function set_updated_at();
create trigger trg_job_type_defaults_updated_at before update on job_type_defaults
  for each row execute function set_updated_at();
create trigger trg_quotes_updated_at before update on quotes
  for each row execute function set_updated_at();
create trigger trg_quote_line_items_updated_at before update on quote_line_items
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS — standard org-scoped pattern
-- ----------------------------------------------------------------------------
alter table insurers enable row level security;
alter table job_type_defaults enable row level security;
alter table quotes enable row level security;
alter table quote_line_items enable row level security;
alter table quote_sequences enable row level security;
alter table config_audit_log enable row level security;

create policy "insurers org" on insurers for all
  using (organisation_id = current_user_org_id()) with check (organisation_id = current_user_org_id());
create policy "job_type_defaults org" on job_type_defaults for all
  using (organisation_id = current_user_org_id()) with check (organisation_id = current_user_org_id());
create policy "quotes org" on quotes for all
  using (organisation_id = current_user_org_id()) with check (organisation_id = current_user_org_id());
create policy "quote_line_items org" on quote_line_items for all
  using (organisation_id = current_user_org_id()) with check (organisation_id = current_user_org_id());
create policy "quote_sequences org" on quote_sequences for all
  using (organisation_id = current_user_org_id()) with check (organisation_id = current_user_org_id());
create policy "config_audit_log org" on config_audit_log for all
  using (organisation_id = current_user_org_id()) with check (organisation_id = current_user_org_id());
