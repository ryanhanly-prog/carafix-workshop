-- Label refinements from workshop-owner feedback. All renames are in-place and
-- lossless; the work_type -> job_type swap maps existing values before dropping
-- the old column so no row data is lost.

-- 1. category -> billing_type (same Private/Insurance/Warranty/Dealer values,
--    clearer name). Rename the enum type and the column.
alter type job_category rename to billing_type;
alter table jobs rename column category to billing_type;

-- 2. work_type -> job_type. The user's job_type list is orthogonal to
--    billing_type (no Insurance/Warranty overlap). Map old values across, then
--    drop the old column + enum.
--    NOTE: 'Pre-purchase inspection' has no slot in the new list and maps to
--    'Other'. If pre-purchase work needs its own job_type later, add it then.
create type job_type as enum (
  'Servicing',
  'Repairs',
  'Upgrades & Installation',
  'Other'
);

alter table jobs add column job_type job_type;

update jobs set job_type = (
  case work_type
    when 'Service' then 'Servicing'
    when 'Repair' then 'Repairs'
    when 'Modification' then 'Upgrades & Installation'
    when 'Pre-purchase inspection' then 'Other'
    when 'Other' then 'Other'
    else null
  end
)::job_type;

alter table jobs drop column work_type;
drop type work_type;

-- 3. Date fields: clearer names + the new customer-promised pickup date.
alter table jobs rename column booked_in_date to booking_date;
alter table jobs rename column planned_start_date to job_start_date;
alter table jobs add column customer_promised_date date;

-- 4. sync_primary_task() reads planned_start_date in its body. A column rename
--    does NOT rewrite function bodies, so recreate the function + trigger to
--    use job_start_date, otherwise the next job insert/update would error.
create or replace function sync_primary_task()
returns trigger as $$
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
      assigned_tech_id, scheduled_date, scheduled_hours, status
    ) values (
      new.id, 1,
      coalesce(new.description, 'Primary work'),
      new.primary_skill_id,
      coalesce(new.quoted_hours, 0),
      new.assigned_tech_id,
      new.job_start_date,
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
      scheduled_date = new.job_start_date
    where id = existing_task_id;
  end if;
  return new;
end;
$$ language plpgsql;

alter function public.sync_primary_task() set search_path = public;

drop trigger if exists trg_jobs_sync_primary_task on jobs;
create trigger trg_jobs_sync_primary_task
  after insert or update of primary_skill_id, quoted_hours, assigned_tech_id,
                            job_start_date, description
  on jobs
  for each row execute function sync_primary_task();
