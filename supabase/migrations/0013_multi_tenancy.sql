-- Step 3c: Multi-tenancy.
--
-- DESTRUCTIVE: adds organisation_id to every business table, backfills existing
-- rows to the Carafix org, and REPLACES the role-gated RLS model from 0004/0007
-- with an org-scoped model. Rollback point: Supabase automatic backup 2026-05-26
-- 17:44 UTC (confirmed by user before this ran).
--
-- RLS recursion trap (the big one): current_user_org_id() reads app_users, and
-- app_users itself has RLS. Marking the function SECURITY DEFINER makes it run as
-- the function owner (postgres, who owns app_users and bypasses its RLS), so the
-- read does not re-enter app_users' policies. app_users' own "org members" policy
-- therefore uses this helper rather than an inline `select ... from app_users`
-- subquery, which WOULD trigger "infinite recursion detected in policy".

-- ===========================================================================
-- 1. organisations
-- ===========================================================================
create table organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  trading_name text,
  abn text,
  address text,
  phone text,
  email text,
  logo_url text,
  brand_primary_color text,
  is_platform_owner boolean default false,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

insert into organisations (id, name, slug, trading_name, abn, is_platform_owner) values
  ('00000000-0000-0000-0000-000000000001', 'TeamRoll', 'teamroll', 'TeamRoll Pty Ltd', null, true),
  ('00000000-0000-0000-0000-000000000002', 'Carafix', 'carafix', 'Carafix Caravan Repairs', '66663914154', false);

-- ===========================================================================
-- 2. Add organisation_id to every business table (nullable first, backfill,
--    then NOT NULL).
-- ===========================================================================
alter table locations         add column organisation_id uuid references organisations(id);
alter table customers         add column organisation_id uuid references organisations(id);
alter table vans              add column organisation_id uuid references organisations(id);
alter table technicians       add column organisation_id uuid references organisations(id);
alter table jobs              add column organisation_id uuid references organisations(id);
alter table tasks             add column organisation_id uuid references organisations(id);
alter table parts             add column organisation_id uuid references organisations(id);
alter table bays              add column organisation_id uuid references organisations(id);
alter table holidays          add column organisation_id uuid references organisations(id);
alter table job_attachments   add column organisation_id uuid references organisations(id);
alter table job_status_log    add column organisation_id uuid references organisations(id);
alter table promise_date_log  add column organisation_id uuid references organisations(id);
alter table ai_briefings      add column organisation_id uuid references organisations(id);
alter table app_users         add column organisation_id uuid references organisations(id);

alter table import_batches            add column organisation_id uuid references organisations(id);
alter table suppliers                 add column organisation_id uuid references organisations(id);
alter table stock_items               add column organisation_id uuid references organisations(id);
alter table historical_invoices       add column organisation_id uuid references organisations(id);
alter table historical_invoice_items  add column organisation_id uuid references organisations(id);
alter table historical_quotes         add column organisation_id uuid references organisations(id);
alter table historical_quote_items    add column organisation_id uuid references organisations(id);

-- ===========================================================================
-- 3. Backfill all existing rows to Carafix.
-- ===========================================================================
update locations         set organisation_id = '00000000-0000-0000-0000-000000000002';
update customers         set organisation_id = '00000000-0000-0000-0000-000000000002';
update vans              set organisation_id = '00000000-0000-0000-0000-000000000002';
update technicians       set organisation_id = '00000000-0000-0000-0000-000000000002';
update jobs              set organisation_id = '00000000-0000-0000-0000-000000000002';
update tasks             set organisation_id = '00000000-0000-0000-0000-000000000002';
update parts             set organisation_id = '00000000-0000-0000-0000-000000000002';
update bays              set organisation_id = '00000000-0000-0000-0000-000000000002';
update holidays          set organisation_id = '00000000-0000-0000-0000-000000000002';
update job_attachments   set organisation_id = '00000000-0000-0000-0000-000000000002';
update job_status_log    set organisation_id = '00000000-0000-0000-0000-000000000002';
update promise_date_log  set organisation_id = '00000000-0000-0000-0000-000000000002';
update ai_briefings      set organisation_id = '00000000-0000-0000-0000-000000000002';
update app_users         set organisation_id = '00000000-0000-0000-0000-000000000002';
-- Block B tables are empty at this point; the UPDATEs are no-ops but kept for symmetry.

-- ===========================================================================
-- 4. NOT NULL (existing-data tables only). The import tables stay nullable until
--    they have rows of their own org; they are populated exclusively by the
--    importer which always sets organisation_id, and a NOT NULL is added to them
--    here too since they are currently empty.
-- ===========================================================================
alter table locations         alter column organisation_id set not null;
alter table customers         alter column organisation_id set not null;
alter table vans              alter column organisation_id set not null;
alter table technicians       alter column organisation_id set not null;
alter table jobs              alter column organisation_id set not null;
alter table tasks             alter column organisation_id set not null;
alter table parts             alter column organisation_id set not null;
alter table bays              alter column organisation_id set not null;
alter table holidays          alter column organisation_id set not null;
alter table job_attachments   alter column organisation_id set not null;
alter table job_status_log    alter column organisation_id set not null;
alter table promise_date_log  alter column organisation_id set not null;
alter table ai_briefings      alter column organisation_id set not null;
alter table app_users         alter column organisation_id set not null;
alter table import_batches            alter column organisation_id set not null;
alter table suppliers                 alter column organisation_id set not null;
alter table stock_items               alter column organisation_id set not null;
alter table historical_invoices       alter column organisation_id set not null;
alter table historical_invoice_items  alter column organisation_id set not null;
alter table historical_quotes         alter column organisation_id set not null;
alter table historical_quote_items    alter column organisation_id set not null;

-- ===========================================================================
-- 5. Uniqueness constraints (org-scoped).
--
-- NOTE on stock_items: the prompt proposed unique (organisation_id, stock_number),
-- but the real Mechanic Desk export has 22 blank stock numbers and ~12 genuine
-- duplicate stock numbers across 5,354 rows, so that constraint would fail on
-- insert. The stable identity in the source is the Mechanic Desk UUID, exposed
-- here as external_id, so uniqueness and import idempotency key on
-- (organisation_id, external_id) instead. stock_number keeps a non-unique index
-- for catalogue lookups. (D4 of the prompt also says stock is "matched by
-- external_id", confirming this is the intended key.)
-- ===========================================================================
alter table stock_items
  add constraint stock_items_org_external_unique unique (organisation_id, external_id);
alter table suppliers
  add constraint suppliers_org_name_unique unique (organisation_id, name);
alter table historical_invoices
  add constraint hist_invoices_org_number_unique unique (organisation_id, invoice_number);
alter table historical_quotes
  add constraint hist_quotes_org_number_unique unique (organisation_id, quote_number);

-- ===========================================================================
-- 6. Indexes for common lookups.
-- ===========================================================================
create index idx_jobs_org_location       on jobs(organisation_id, location_id);
create index idx_customers_org            on customers(organisation_id);
create index idx_vans_org                 on vans(organisation_id);
create index idx_technicians_org          on technicians(organisation_id);
create index idx_stock_org_category       on stock_items(organisation_id, category);
create index idx_stock_org_last_sales     on stock_items(organisation_id, last_sales_date desc);
create index idx_stock_org_stock_number   on stock_items(organisation_id, stock_number);
create index idx_hist_invoices_org_date   on historical_invoices(organisation_id, issue_date desc);
create index idx_hist_invoices_vehicle    on historical_invoices(organisation_id, vehicle_make, vehicle_model);
create index idx_hist_invoice_items_org_inv on historical_invoice_items(organisation_id, invoice_number);
create index idx_hist_quote_items_org_q   on historical_quote_items(organisation_id, quote_number);

-- ===========================================================================
-- 7. The org helper. SECURITY DEFINER so it bypasses app_users RLS (no recursion).
-- ===========================================================================
create or replace function current_user_org_id()
returns uuid
language sql
security definer
set search_path = public, auth
stable
as $$
  select organisation_id from public.app_users where id = auth.uid()
$$;

grant execute on function current_user_org_id() to authenticated;

-- ===========================================================================
-- 8. Drop all existing policies, recreate org-scoped.
-- ===========================================================================

-- organisations: a user sees only their own org. RLS was not previously enabled.
alter table organisations enable row level security;
create policy "org_select_self" on organisations
  for select using (id = current_user_org_id());

-- ---- app_users: non-recursive self + helper-based org membership ----
drop policy if exists "app_users_self_select" on app_users;
create policy "users see own profile" on app_users
  for select using (id = auth.uid());
create policy "org members see users in their org" on app_users
  for select using (organisation_id = current_user_org_id());

-- ---- locations ----
drop policy if exists "locations_auth_read" on locations;
create policy "locations_select_org" on locations for select using (organisation_id = current_user_org_id());
create policy "locations_insert_org" on locations for insert with check (organisation_id = current_user_org_id());
create policy "locations_update_org" on locations for update using (organisation_id = current_user_org_id()) with check (organisation_id = current_user_org_id());
create policy "locations_delete_org" on locations for delete using (organisation_id = current_user_org_id());

-- ---- customers ----
drop policy if exists "customers_controller_select" on customers;
drop policy if exists "customers_controller_insert" on customers;
drop policy if exists "customers_controller_update" on customers;
create policy "customers_select_org" on customers for select using (organisation_id = current_user_org_id());
create policy "customers_insert_org" on customers for insert with check (organisation_id = current_user_org_id());
create policy "customers_update_org" on customers for update using (organisation_id = current_user_org_id()) with check (organisation_id = current_user_org_id());
create policy "customers_delete_org" on customers for delete using (organisation_id = current_user_org_id());

-- ---- vans ----
drop policy if exists "vans_controller_select" on vans;
drop policy if exists "vans_controller_insert" on vans;
drop policy if exists "vans_controller_update" on vans;
create policy "vans_select_org" on vans for select using (organisation_id = current_user_org_id());
create policy "vans_insert_org" on vans for insert with check (organisation_id = current_user_org_id());
create policy "vans_update_org" on vans for update using (organisation_id = current_user_org_id()) with check (organisation_id = current_user_org_id());
create policy "vans_delete_org" on vans for delete using (organisation_id = current_user_org_id());

-- ---- technicians ----
drop policy if exists "technicians_controller_all" on technicians;
drop policy if exists "technicians_self_select" on technicians;
create policy "technicians_select_org" on technicians for select using (organisation_id = current_user_org_id());
create policy "technicians_insert_org" on technicians for insert with check (organisation_id = current_user_org_id());
create policy "technicians_update_org" on technicians for update using (organisation_id = current_user_org_id()) with check (organisation_id = current_user_org_id());
create policy "technicians_delete_org" on technicians for delete using (organisation_id = current_user_org_id());

-- ---- jobs ----
drop policy if exists "jobs_controller_all" on jobs;
create policy "jobs_select_org" on jobs for select using (organisation_id = current_user_org_id());
create policy "jobs_insert_org" on jobs for insert with check (organisation_id = current_user_org_id());
create policy "jobs_update_org" on jobs for update using (organisation_id = current_user_org_id()) with check (organisation_id = current_user_org_id());
create policy "jobs_delete_org" on jobs for delete using (organisation_id = current_user_org_id());

-- ---- tasks ----
drop policy if exists "tasks_controller_all" on tasks;
create policy "tasks_select_org" on tasks for select using (organisation_id = current_user_org_id());
create policy "tasks_insert_org" on tasks for insert with check (organisation_id = current_user_org_id());
create policy "tasks_update_org" on tasks for update using (organisation_id = current_user_org_id()) with check (organisation_id = current_user_org_id());
create policy "tasks_delete_org" on tasks for delete using (organisation_id = current_user_org_id());

-- ---- parts ----
drop policy if exists "parts_controller_all" on parts;
create policy "parts_select_org" on parts for select using (organisation_id = current_user_org_id());
create policy "parts_insert_org" on parts for insert with check (organisation_id = current_user_org_id());
create policy "parts_update_org" on parts for update using (organisation_id = current_user_org_id()) with check (organisation_id = current_user_org_id());
create policy "parts_delete_org" on parts for delete using (organisation_id = current_user_org_id());

-- ---- bays ----
drop policy if exists "bays_auth_read" on bays;
create policy "bays_select_org" on bays for select using (organisation_id = current_user_org_id());
create policy "bays_insert_org" on bays for insert with check (organisation_id = current_user_org_id());
create policy "bays_update_org" on bays for update using (organisation_id = current_user_org_id()) with check (organisation_id = current_user_org_id());
create policy "bays_delete_org" on bays for delete using (organisation_id = current_user_org_id());

-- ---- holidays ----
drop policy if exists "holidays_auth_read" on holidays;
create policy "holidays_select_org" on holidays for select using (organisation_id = current_user_org_id());
create policy "holidays_insert_org" on holidays for insert with check (organisation_id = current_user_org_id());
create policy "holidays_update_org" on holidays for update using (organisation_id = current_user_org_id()) with check (organisation_id = current_user_org_id());
create policy "holidays_delete_org" on holidays for delete using (organisation_id = current_user_org_id());

-- ---- job_attachments ----
drop policy if exists "job_attachments_controller_all" on job_attachments;
create policy "job_attachments_select_org" on job_attachments for select using (organisation_id = current_user_org_id());
create policy "job_attachments_insert_org" on job_attachments for insert with check (organisation_id = current_user_org_id());
create policy "job_attachments_update_org" on job_attachments for update using (organisation_id = current_user_org_id()) with check (organisation_id = current_user_org_id());
create policy "job_attachments_delete_org" on job_attachments for delete using (organisation_id = current_user_org_id());

-- ---- job_status_log ----
drop policy if exists "job_status_log_controller_all" on job_status_log;
create policy "job_status_log_select_org" on job_status_log for select using (organisation_id = current_user_org_id());
create policy "job_status_log_insert_org" on job_status_log for insert with check (organisation_id = current_user_org_id());
create policy "job_status_log_update_org" on job_status_log for update using (organisation_id = current_user_org_id()) with check (organisation_id = current_user_org_id());
create policy "job_status_log_delete_org" on job_status_log for delete using (organisation_id = current_user_org_id());

-- ---- promise_date_log ----
drop policy if exists "promise_date_log_controller_all" on promise_date_log;
create policy "promise_date_log_select_org" on promise_date_log for select using (organisation_id = current_user_org_id());
create policy "promise_date_log_insert_org" on promise_date_log for insert with check (organisation_id = current_user_org_id());
create policy "promise_date_log_update_org" on promise_date_log for update using (organisation_id = current_user_org_id()) with check (organisation_id = current_user_org_id());
create policy "promise_date_log_delete_org" on promise_date_log for delete using (organisation_id = current_user_org_id());

-- ---- ai_briefings ----
drop policy if exists "ai_briefings_controller_all" on ai_briefings;
create policy "ai_briefings_select_org" on ai_briefings for select using (organisation_id = current_user_org_id());
create policy "ai_briefings_insert_org" on ai_briefings for insert with check (organisation_id = current_user_org_id());
create policy "ai_briefings_update_org" on ai_briefings for update using (organisation_id = current_user_org_id()) with check (organisation_id = current_user_org_id());
create policy "ai_briefings_delete_org" on ai_briefings for delete using (organisation_id = current_user_org_id());

-- ---- import_batches ----
drop policy if exists "no access pre tenancy" on import_batches;
create policy "import_batches_select_org" on import_batches for select using (organisation_id = current_user_org_id());
create policy "import_batches_insert_org" on import_batches for insert with check (organisation_id = current_user_org_id());
create policy "import_batches_update_org" on import_batches for update using (organisation_id = current_user_org_id()) with check (organisation_id = current_user_org_id());
create policy "import_batches_delete_org" on import_batches for delete using (organisation_id = current_user_org_id());

-- ---- suppliers ----
drop policy if exists "no access pre tenancy" on suppliers;
create policy "suppliers_select_org" on suppliers for select using (organisation_id = current_user_org_id());
create policy "suppliers_insert_org" on suppliers for insert with check (organisation_id = current_user_org_id());
create policy "suppliers_update_org" on suppliers for update using (organisation_id = current_user_org_id()) with check (organisation_id = current_user_org_id());
create policy "suppliers_delete_org" on suppliers for delete using (organisation_id = current_user_org_id());

-- ---- stock_items ----
drop policy if exists "no access pre tenancy" on stock_items;
create policy "stock_items_select_org" on stock_items for select using (organisation_id = current_user_org_id());
create policy "stock_items_insert_org" on stock_items for insert with check (organisation_id = current_user_org_id());
create policy "stock_items_update_org" on stock_items for update using (organisation_id = current_user_org_id()) with check (organisation_id = current_user_org_id());
create policy "stock_items_delete_org" on stock_items for delete using (organisation_id = current_user_org_id());

-- ---- stock_item_suppliers (no org column — scope via stock_items join) ----
drop policy if exists "no access pre tenancy" on stock_item_suppliers;
create policy "sis_select_org" on stock_item_suppliers for select using (
  stock_item_id in (select id from stock_items where organisation_id = current_user_org_id()));
create policy "sis_insert_org" on stock_item_suppliers for insert with check (
  stock_item_id in (select id from stock_items where organisation_id = current_user_org_id()));
create policy "sis_update_org" on stock_item_suppliers for update using (
  stock_item_id in (select id from stock_items where organisation_id = current_user_org_id())) with check (
  stock_item_id in (select id from stock_items where organisation_id = current_user_org_id()));
create policy "sis_delete_org" on stock_item_suppliers for delete using (
  stock_item_id in (select id from stock_items where organisation_id = current_user_org_id()));

-- ---- historical_invoices ----
drop policy if exists "no access pre tenancy" on historical_invoices;
create policy "hist_invoices_select_org" on historical_invoices for select using (organisation_id = current_user_org_id());
create policy "hist_invoices_insert_org" on historical_invoices for insert with check (organisation_id = current_user_org_id());
create policy "hist_invoices_update_org" on historical_invoices for update using (organisation_id = current_user_org_id()) with check (organisation_id = current_user_org_id());
create policy "hist_invoices_delete_org" on historical_invoices for delete using (organisation_id = current_user_org_id());

-- ---- historical_invoice_items ----
drop policy if exists "no access pre tenancy" on historical_invoice_items;
create policy "hist_inv_items_select_org" on historical_invoice_items for select using (organisation_id = current_user_org_id());
create policy "hist_inv_items_insert_org" on historical_invoice_items for insert with check (organisation_id = current_user_org_id());
create policy "hist_inv_items_update_org" on historical_invoice_items for update using (organisation_id = current_user_org_id()) with check (organisation_id = current_user_org_id());
create policy "hist_inv_items_delete_org" on historical_invoice_items for delete using (organisation_id = current_user_org_id());

-- ---- historical_quotes ----
drop policy if exists "no access pre tenancy" on historical_quotes;
create policy "hist_quotes_select_org" on historical_quotes for select using (organisation_id = current_user_org_id());
create policy "hist_quotes_insert_org" on historical_quotes for insert with check (organisation_id = current_user_org_id());
create policy "hist_quotes_update_org" on historical_quotes for update using (organisation_id = current_user_org_id()) with check (organisation_id = current_user_org_id());
create policy "hist_quotes_delete_org" on historical_quotes for delete using (organisation_id = current_user_org_id());

-- ---- historical_quote_items ----
drop policy if exists "no access pre tenancy" on historical_quote_items;
create policy "hist_q_items_select_org" on historical_quote_items for select using (organisation_id = current_user_org_id());
create policy "hist_q_items_insert_org" on historical_quote_items for insert with check (organisation_id = current_user_org_id());
create policy "hist_q_items_update_org" on historical_quote_items for update using (organisation_id = current_user_org_id()) with check (organisation_id = current_user_org_id());
create policy "hist_q_items_delete_org" on historical_quote_items for delete using (organisation_id = current_user_org_id());

-- ---- technician_skills (no org column — scope via technicians join) ----
drop policy if exists "technician_skills_controller_all" on technician_skills;
create policy "tskills_select_org" on technician_skills for select using (
  technician_id in (select id from technicians where organisation_id = current_user_org_id()));
create policy "tskills_insert_org" on technician_skills for insert with check (
  technician_id in (select id from technicians where organisation_id = current_user_org_id()));
create policy "tskills_update_org" on technician_skills for update using (
  technician_id in (select id from technicians where organisation_id = current_user_org_id())) with check (
  technician_id in (select id from technicians where organisation_id = current_user_org_id()));
create policy "tskills_delete_org" on technician_skills for delete using (
  technician_id in (select id from technicians where organisation_id = current_user_org_id()));

-- skills and app_config are intentionally left as shared platform reference/config
-- data (their existing auth-read policies remain). is_controller() from 0004 is
-- retained for a possible future role split; it is harmless alongside org scoping.

-- ===========================================================================
-- 9. Views: still security_invoker (set in 0007), so they inherit org scoping
--    through the underlying tables automatically. No redefinition needed.
-- ===========================================================================
