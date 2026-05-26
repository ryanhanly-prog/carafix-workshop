-- RLS policies. v1 model: a single controller operates across all locations,
-- so policies are gated on ROLE (controller) rather than a single
-- default_location_id. Per-location visibility is enforced query-side via the
-- app's LocationContext (where location_id = <selected>). Tightening a
-- controller to specific sites later means a controller_locations mapping.
--
-- Helper runs SECURITY DEFINER so reading app_users inside a policy does not
-- recurse through app_users' own RLS.

create or replace function public.is_controller()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_users
    where id = auth.uid() and role = 'controller'
  );
$$;

-- Enable RLS on in-scope tables that did not already have it (jobs, tasks,
-- parts, technicians, app_users, job_attachments were enabled in 0001).
alter table customers enable row level security;
alter table vans enable row level security;
alter table locations enable row level security;
alter table skills enable row level security;
alter table bays enable row level security;
alter table holidays enable row level security;
alter table job_status_log enable row level security;
alter table promise_date_log enable row level security;

-- ---------- Business data: controllers, all locations ----------
create policy "jobs_controller_all" on jobs
  for all to authenticated
  using (public.is_controller()) with check (public.is_controller());

create policy "tasks_controller_all" on tasks
  for all to authenticated
  using (public.is_controller()) with check (public.is_controller());

create policy "parts_controller_all" on parts
  for all to authenticated
  using (public.is_controller()) with check (public.is_controller());

create policy "job_attachments_controller_all" on job_attachments
  for all to authenticated
  using (public.is_controller()) with check (public.is_controller());

create policy "job_status_log_controller_all" on job_status_log
  for all to authenticated
  using (public.is_controller()) with check (public.is_controller());

create policy "promise_date_log_controller_all" on promise_date_log
  for all to authenticated
  using (public.is_controller()) with check (public.is_controller());

-- ---------- Technicians: controllers manage; tech self-read (dormant) ----------
create policy "technicians_controller_all" on technicians
  for all to authenticated
  using (public.is_controller()) with check (public.is_controller());

create policy "technicians_self_select" on technicians
  for select to authenticated
  using (auth_user_id = auth.uid());

-- ---------- Customers + vans: controllers, business-wide (no delete) ----------
create policy "customers_controller_select" on customers
  for select to authenticated using (public.is_controller());
create policy "customers_controller_insert" on customers
  for insert to authenticated with check (public.is_controller());
create policy "customers_controller_update" on customers
  for update to authenticated using (public.is_controller()) with check (public.is_controller());

create policy "vans_controller_select" on vans
  for select to authenticated using (public.is_controller());
create policy "vans_controller_insert" on vans
  for insert to authenticated with check (public.is_controller());
create policy "vans_controller_update" on vans
  for update to authenticated using (public.is_controller()) with check (public.is_controller());

-- ---------- app_users: a user can read their own row ----------
create policy "app_users_self_select" on app_users
  for select to authenticated using (id = auth.uid());

-- ---------- Read-only reference data for any authenticated user ----------
create policy "locations_auth_read" on locations
  for select to authenticated using (true);
create policy "skills_auth_read" on skills
  for select to authenticated using (true);
create policy "bays_auth_read" on bays
  for select to authenticated using (true);
create policy "holidays_auth_read" on holidays
  for select to authenticated using (true);
