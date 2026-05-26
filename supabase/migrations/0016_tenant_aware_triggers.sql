-- Step 3 follow-up: make the existing trigger functions tenant-aware.
--
-- Multi-tenancy (0013) added a NOT NULL organisation_id to job_status_log,
-- promise_date_log and tasks. These rows are written by triggers on `jobs`, not
-- by application code, so the triggers must propagate the parent job's
-- organisation_id or every job insert/status change/date change would fail.

create or replace function public.log_job_status_change()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.status is distinct from old.status then
    insert into job_status_log(job_id, from_status, to_status, changed_at, organisation_id)
    values (new.id, old.status, new.status, now(), new.organisation_id);
  end if;
  return new;
end;
$function$;

create or replace function public.log_promise_date_change()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.expected_finish_date is distinct from old.expected_finish_date then
    insert into promise_date_log(job_id, old_date, new_date, changed_at, organisation_id)
    values (new.id, old.expected_finish_date, new.expected_finish_date, now(), new.organisation_id);
  end if;
  return new;
end;
$function$;

create or replace function public.sync_primary_task()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  multi_enabled boolean;
  existing_task_id uuid;
begin
  select (value = 'true') into multi_enabled
    from app_config where key = 'multi_task_enabled';
  if multi_enabled then
    return new;
  end if;

  select id into existing_task_id
    from tasks where job_id = new.id and sequence_order = 1
    limit 1;

  if existing_task_id is null then
    insert into tasks(
      job_id, sequence_order, title, skill_id, quoted_hours,
      assigned_tech_id, scheduled_date, scheduled_hours, status, organisation_id
    ) values (
      new.id, 1,
      coalesce(new.description, 'Primary work'),
      new.primary_skill_id,
      coalesce(new.quoted_hours, 0),
      new.assigned_tech_id,
      new.job_start_date,
      coalesce(new.quoted_hours, 0),
      'Not Started',
      new.organisation_id
    );
  else
    update tasks set
      title = coalesce(new.description, title),
      skill_id = coalesce(new.primary_skill_id, skill_id),
      quoted_hours = coalesce(new.quoted_hours, quoted_hours),
      scheduled_hours = coalesce(new.quoted_hours, scheduled_hours),
      assigned_tech_id = new.assigned_tech_id,
      scheduled_date = new.job_start_date
    where id = existing_task_id;
  end if;
  return new;
end;
$function$;
