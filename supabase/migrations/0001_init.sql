-- ============================================================
-- Carafix Workshop Scheduler — Initial Schema
-- Supabase / Postgres
-- ============================================================

-- ---------- ENUMS ----------
create type job_status as enum (
  'Booked In',
  'Waiting to Start',
  'In Progress',
  'Waiting on Parts',
  'QA Check',
  'Ready for Pickup',
  'Picked Up'
);

create type task_status as enum (
  'Not Started',
  'In Progress',
  'Waiting on Parts',
  'QA Complete',
  'Done'
);

create type job_category as enum (
  'Private',
  'Insurance',
  'Warranty',
  'Dealer'
);

create type priority_level as enum ('Low', 'Normal', 'High', 'Urgent');

create type invoice_status as enum ('Not Invoiced', 'Draft', 'Sent', 'Complete');

create type skill_level as enum ('learning', 'competent', 'primary');

create type part_status as enum ('Needed', 'Ordered', 'Received', 'Fitted', 'Cancelled');

create type bay_type as enum ('Drive-in Bay', 'Yard Slot', 'Offsite Storage');

-- ---------- CORE ENTITIES ----------

create table locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  active boolean default true,
  created_at timestamptz default now()
);

create table skills (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  description text
);

create table technicians (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references locations(id) on delete restrict,
  name text not null,
  email text unique,
  phone text,
  productive_hours_per_day numeric default 6.5,
  weekly_capacity_hours numeric default 32.5,
  colour text default '#3b82f6',
  active boolean default true,
  auth_user_id uuid unique,  -- links to supabase auth.users for mobile login
  created_at timestamptz default now()
);

create table technician_skills (
  technician_id uuid references technicians(id) on delete cascade,
  skill_id uuid references skills(id) on delete cascade,
  level skill_level not null default 'competent',
  primary key (technician_id, skill_id)
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  notes text,
  created_at timestamptz default now()
);

create table vans (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete restrict,
  make text,
  model text,
  year int,
  rego text,
  notes text,
  created_at timestamptz default now()
);

create table bays (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references locations(id) on delete cascade,
  name text not null,
  type bay_type not null default 'Drive-in Bay',
  active boolean default true
);

create table holidays (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references locations(id) on delete cascade,
  date date not null,
  name text,
  unique (location_id, date)
);

-- ---------- JOBS & TASKS ----------

create table jobs (
  id uuid primary key default gen_random_uuid(),
  job_number text unique not null,                -- human-friendly, e.g. CAR-2025-0142
  location_id uuid references locations(id) on delete restrict not null,
  van_id uuid references vans(id) on delete restrict not null,
  customer_id uuid references customers(id) on delete restrict not null,
  bay_id uuid references bays(id) on delete set null,

  category job_category not null default 'Private',
  priority priority_level not null default 'Normal',
  status job_status not null default 'Booked In',

  description text,
  internal_notes text,

  -- v1 convenience columns: single tech per job, single skill.
  -- A trigger keeps the auto-created task row in sync with these.
  -- When v1.5 enables multi-task jobs, these become the "primary" task only.
  primary_skill_id uuid references skills(id),
  quoted_hours numeric,
  assigned_tech_id uuid references technicians(id) on delete set null,

  booked_in_date date,                            -- when van arrives
  planned_start_date date,
  expected_finish_date date,                      -- derived, but stored for fast queries
  actual_finish_date date,
  pickup_booked_date date,
  picked_up_date date,

  invoice_status invoice_status default 'Not Invoiced',
  total_quoted_hours numeric generated always as (0) stored,  -- placeholder; updated via trigger below

  mechanic_desk_ref text,                         -- for CSV import linkage
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_jobs_location_status on jobs(location_id, status);
create index idx_jobs_expected_finish on jobs(expected_finish_date);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade not null,
  sequence_order int not null,                    -- 1, 2, 3 within the job
  depends_on_task_id uuid references tasks(id) on delete set null,

  title text not null,                            -- "Replace awning", "12V diagnose"
  description text,
  skill_id uuid references skills(id) on delete restrict not null,
  quoted_hours numeric not null,

  assigned_tech_id uuid references technicians(id) on delete set null,
  scheduled_date date,                            -- which day the work happens
  scheduled_hours numeric,                        -- usually = quoted_hours; can split across days later

  status task_status not null default 'Not Started',
  started_at timestamptz,
  completed_at timestamptz,
  actual_hours numeric,                           -- for the learning loop

  notes text,
  created_at timestamptz default now()
);

create index idx_tasks_job on tasks(job_id, sequence_order);
create index idx_tasks_tech_date on tasks(assigned_tech_id, scheduled_date);
create index idx_tasks_status on tasks(status);

-- ---------- PARTS ----------

create table parts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade not null,
  task_id uuid references tasks(id) on delete set null,  -- optional: which task needs it
  description text not null,
  supplier text,
  quantity numeric default 1,
  is_critical boolean default true,               -- if true, blocks task start
  status part_status not null default 'Needed',
  ordered_date date,
  eta_date date,
  received_date date,
  cost numeric,
  notes text,
  created_at timestamptz default now()
);

create index idx_parts_job on parts(job_id);
create index idx_parts_status on parts(status);

-- ---------- HISTORY / AUDIT ----------

create table job_status_log (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  from_status job_status,
  to_status job_status,
  reason text,
  changed_by uuid,                                -- auth.users id
  changed_at timestamptz default now()
);

create table promise_date_log (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  old_date date,
  new_date date,
  reason text,
  changed_by uuid,
  changed_at timestamptz default now()
);

-- ---------- ATTACHMENTS (photos / voice notes from techs) ----------

create table job_attachments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  uploaded_by uuid,
  kind text check (kind in ('photo', 'voice', 'transcript', 'document')),
  storage_path text not null,
  caption text,
  transcript text,                                -- for voice notes
  created_at timestamptz default now()
);

-- ---------- AI BRIEFING CACHE ----------

create table ai_briefings (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references locations(id) on delete cascade,
  briefing_date date not null,
  content_md text not null,
  generated_at timestamptz default now(),
  unique (location_id, briefing_date)
);

-- ---------- USERS (controllers) ----------
-- Supabase auth.users handles auth; this table extends with role + location
create table app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text check (role in ('controller', 'manager', 'technician')) not null,
  default_location_id uuid references locations(id),
  created_at timestamptz default now()
);

-- ============================================================
-- TRIGGERS & DERIVED FIELDS
-- ============================================================

-- Update jobs.updated_at on any change
create or replace function touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_jobs_updated_at before update on jobs
  for each row execute function touch_updated_at();

-- Log status changes
create or replace function log_job_status_change()
returns trigger as $$
begin
  if new.status is distinct from old.status then
    insert into job_status_log(job_id, from_status, to_status, changed_at)
    values (new.id, old.status, new.status, now());
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_jobs_status_log after update on jobs
  for each row execute function log_job_status_change();

-- Log promise-date changes
create or replace function log_promise_date_change()
returns trigger as $$
begin
  if new.expected_finish_date is distinct from old.expected_finish_date then
    insert into promise_date_log(job_id, old_date, new_date, changed_at)
    values (new.id, old.expected_finish_date, new.expected_finish_date, now());
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_jobs_promise_log after update on jobs
  for each row execute function log_promise_date_change();

-- ============================================================
-- V1 SINGLE-TASK SYNC
-- In v1, the UI hides tasks: each job has exactly one auto-managed task.
-- These triggers keep that hidden task in sync with the convenience
-- columns on jobs (primary_skill_id, quoted_hours, assigned_tech_id,
-- planned_start_date). When v1.5 multi-task UI ships, set
-- app_config.multi_task_enabled = true and these triggers no-op.
-- ============================================================

create table if not exists app_config (
  key text primary key,
  value text not null
);
insert into app_config(key, value) values ('multi_task_enabled', 'false')
  on conflict (key) do nothing;

create or replace function sync_primary_task()
returns trigger as $$
declare
  multi_enabled boolean;
  existing_task_id uuid;
begin
  select (value = 'true') into multi_enabled
    from app_config where key = 'multi_task_enabled';
  if multi_enabled then
    return new;  -- multi-task mode: UI owns tasks, do nothing
  end if;

  select id into existing_task_id
    from tasks where job_id = new.id and sequence_order = 1
    limit 1;

  if existing_task_id is null then
    -- create the single primary task
    insert into tasks(
      job_id, sequence_order, title, skill_id, quoted_hours,
      assigned_tech_id, scheduled_date, scheduled_hours, status
    ) values (
      new.id, 1,
      coalesce(new.description, 'Primary work'),
      new.primary_skill_id,
      coalesce(new.quoted_hours, 0),
      new.assigned_tech_id,
      new.planned_start_date,
      coalesce(new.quoted_hours, 0),
      'Not Started'
    );
  else
    update tasks set
      title = coalesce(new.description, title),
      skill_id = coalesce(new.primary_skill_id, skill_id),
      quoted_hours = coalesce(new.quoted_hours, quoted_hours),
      scheduled_hours = coalesce(new.quoted_hours, scheduled_hours),
      assigned_tech_id = new.assigned_tech_id,
      scheduled_date = new.planned_start_date
    where id = existing_task_id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_jobs_sync_primary_task
  after insert or update of primary_skill_id, quoted_hours, assigned_tech_id,
                            planned_start_date, description
  on jobs
  for each row execute function sync_primary_task();

-- ============================================================
-- DERIVED VIEWS
-- ============================================================

-- Per-job rollup: total quoted hours, days required, last scheduled task date
create or replace view v_job_rollup as
select
  j.id as job_id,
  j.job_number,
  j.location_id,
  j.status,
  j.expected_finish_date,
  j.invoice_status,
  coalesce(sum(t.quoted_hours), 0) as total_quoted_hours,
  ceil((coalesce(sum(t.quoted_hours), 0) / 6.5) * 2) / 2.0 as estimated_days,
  max(t.scheduled_date) as last_scheduled_date,
  count(t.id) as task_count,
  count(t.id) filter (where t.status = 'Done') as tasks_done,
  -- delay flag
  case
    when current_date > j.expected_finish_date
     and j.status not in ('Ready for Pickup', 'Picked Up')
    then true else false
  end as is_delayed,
  -- pickup ready
  case
    when j.status = 'QA Check'
     and j.invoice_status = 'Complete'
     and not exists (select 1 from tasks tt where tt.job_id = j.id and tt.status <> 'Done')
    then true else false
  end as is_pickup_ready
from jobs j
left join tasks t on t.job_id = j.id
group by j.id;

-- Per-technician daily load
create or replace view v_tech_daily_load as
select
  t.assigned_tech_id as technician_id,
  t.scheduled_date,
  sum(t.scheduled_hours) as scheduled_hours,
  count(*) as task_count
from tasks t
where t.assigned_tech_id is not null
  and t.scheduled_date is not null
  and t.status <> 'Done'
group by t.assigned_tech_id, t.scheduled_date;

-- Per-technician weekly utilisation
create or replace view v_tech_weekly_utilisation as
select
  tech.id as technician_id,
  tech.name,
  date_trunc('week', t.scheduled_date)::date as week_start,
  sum(t.scheduled_hours) as scheduled_hours,
  tech.weekly_capacity_hours,
  round((sum(t.scheduled_hours) / nullif(tech.weekly_capacity_hours, 0)) * 100, 1) as utilisation_pct
from technicians tech
left join tasks t
  on t.assigned_tech_id = tech.id
 and t.status <> 'Done'
group by tech.id, tech.name, date_trunc('week', t.scheduled_date), tech.weekly_capacity_hours;

-- Per-skill daily demand (for bottleneck forecast)
create or replace view v_skill_daily_demand as
select
  t.scheduled_date,
  s.id as skill_id,
  s.name as skill_name,
  sum(t.scheduled_hours) as demanded_hours,
  count(*) as task_count
from tasks t
join skills s on s.id = t.skill_id
where t.scheduled_date is not null
  and t.status <> 'Done'
group by t.scheduled_date, s.id, s.name;

-- ============================================================
-- SEED DATA
-- ============================================================

insert into locations (name, address) values
  ('Arundel', 'Arundel QLD'),
  ('Currumbin', 'Currumbin QLD');

insert into skills (name, description) values
  ('General Service', 'Mechanical service, brakes, bearings, general repairs'),
  ('Auto-Electrical', '12V, solar, batteries, inverters, wiring'),
  ('Awnings & External', 'Awnings, external fittings, locks, hatches'),
  ('Cabinetry & Interior', 'Internal repairs, joinery, upholstery'),
  ('Chassis & Suspension', 'Chassis, suspension, brakes, towing'),
  ('Gas & Plumbing', 'Gas, water systems, hot water units'),
  ('Appliances', 'Fridges, AC, cooktops, hot water units'),
  ('Warranty & Insurance', 'Warranty admin, insurance assessor liaison'),
  ('QA & Roadworthy', 'Pre-delivery, QA inspection, roadworthy');

-- ============================================================
-- RLS (Row Level Security) — enable, policies added in app code
-- ============================================================
alter table jobs enable row level security;
alter table tasks enable row level security;
alter table parts enable row level security;
alter table technicians enable row level security;
alter table app_users enable row level security;
alter table job_attachments enable row level security;
-- Policies to be added per-environment; controllers see all in their location,
-- technicians see only their own assigned tasks + parent jobs.
