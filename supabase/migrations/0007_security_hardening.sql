-- Security hardening surfaced by the linter after enabling RLS.

-- 1. Views must respect the querying user's RLS, not the creator's. Without
--    this, querying v_job_rollup etc. would bypass the policies added in 0004.
alter view v_job_rollup set (security_invoker = true);
alter view v_tech_daily_load set (security_invoker = true);
alter view v_tech_weekly_utilisation set (security_invoker = true);
alter view v_skill_daily_demand set (security_invoker = true);

-- 2. Lock down the remaining public tables (outside the prompt's explicit list,
--    but leaving them open contradicts "block unauthenticated"). app_config is
--    read by the sync_primary_task trigger, so authenticated users keep read
--    access; nobody but the service role can write it.
alter table technician_skills enable row level security;
create policy "technician_skills_controller_all" on technician_skills
  for all to authenticated
  using (public.is_controller()) with check (public.is_controller());

alter table ai_briefings enable row level security;
create policy "ai_briefings_controller_all" on ai_briefings
  for all to authenticated
  using (public.is_controller()) with check (public.is_controller());

alter table app_config enable row level security;
create policy "app_config_auth_read" on app_config
  for select to authenticated using (true);

-- 3. Pin mutable search_paths on the existing trigger functions.
alter function public.touch_updated_at() set search_path = public;
alter function public.log_job_status_change() set search_path = public;
alter function public.log_promise_date_change() set search_path = public;
alter function public.sync_primary_task() set search_path = public;
alter function public.set_job_number() set search_path = public;
