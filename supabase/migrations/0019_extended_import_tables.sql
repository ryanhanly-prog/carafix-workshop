-- Step 3.6c: schema for the strategically important data types in the full
-- Mechanic Desk export — vehicles, jobs, timesheets — plus a canonical job-type
-- back-link on historical_invoices. These power Step 4's hours-suggester.

create table historical_vehicles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  external_id text,
  vehicle_number text,
  registration_number text,
  fleet_number text,
  chassis_number text,
  vin text,
  make text,
  model text,
  year text,
  customer_external_id text,
  customer_name text,
  notes text,
  imported_at timestamptz default now(),
  import_batch_id uuid references import_batches(id),
  unique (organisation_id, external_id)
);

create index idx_hist_vehicles_make_model on historical_vehicles(organisation_id, make, model);
create index idx_hist_vehicles_customer on historical_vehicles(organisation_id, customer_external_id);

create table historical_jobs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  job_number text not null,
  status text,
  key_tag text,
  vehicle_external_id text,
  vehicle_number text,
  registration_number text,
  customer_external_id text,
  customer_number text,
  customer_name text,
  job_type_raw text,
  job_type_canonical_id uuid references job_type_canonical(id),
  description text,
  pickup_time timestamptz,
  start_time timestamptz,
  finish_time timestamptz,
  estimate_hours numeric,
  finished_by text,
  on_hold boolean,
  on_hold_reason text,
  odometer text,
  comments text,
  internal_notes text,
  tags text,
  invoice_number text,
  next_service_date date,
  booked_by text,
  created_by text,
  created_date date,
  imported_at timestamptz default now(),
  import_batch_id uuid references import_batches(id),
  unique (organisation_id, job_number)
);

create index idx_hist_jobs_job_type on historical_jobs(organisation_id, job_type_canonical_id);
create index idx_hist_jobs_invoice on historical_jobs(organisation_id, invoice_number);
create index idx_hist_jobs_vehicle on historical_jobs(organisation_id, vehicle_external_id);

create table historical_timesheets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  date date,
  job_number text,
  job_title text,
  job_description text,
  job_status text,
  customer_name text,
  employee text,
  start_time text,
  end_time text,
  comment text,
  total_hours numeric,
  is_internal_no_charge boolean,
  overtime boolean,
  effective_hours numeric,
  charged_hours numeric,
  amount_charged numeric,
  invoice_item_description text,
  registration_number text,
  fleet_number text,
  imported_at timestamptz default now(),
  import_batch_id uuid references import_batches(id)
);

create index idx_hist_timesheets_job on historical_timesheets(organisation_id, job_number);
create index idx_hist_timesheets_employee on historical_timesheets(organisation_id, employee);
create index idx_hist_timesheets_date on historical_timesheets(organisation_id, date desc);

alter table historical_vehicles enable row level security;
alter table historical_jobs enable row level security;
alter table historical_timesheets enable row level security;

create policy "users see hist_vehicles in their org" on historical_vehicles
  for all using (organisation_id = current_user_org_id())
  with check (organisation_id = current_user_org_id());
create policy "users see hist_jobs in their org" on historical_jobs
  for all using (organisation_id = current_user_org_id())
  with check (organisation_id = current_user_org_id());
create policy "users see hist_timesheets in their org" on historical_timesheets
  for all using (organisation_id = current_user_org_id())
  with check (organisation_id = current_user_org_id());

-- Canonical job-type back-link on invoices (backfilled on import from aliases).
alter table historical_invoices add column job_type_canonical_id uuid references job_type_canonical(id);
create index idx_hist_invoices_canonical_jt on historical_invoices(organisation_id, job_type_canonical_id);
