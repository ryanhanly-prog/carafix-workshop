-- Replace the placeholder job_number with a real sequential generator.
-- Global sequence: numbers look like 100001, 100002, ... (plain integers as
-- text, no prefix). The controller never types these; they auto-generate.

create sequence if not exists job_number_seq start 100001;

create or replace function set_job_number()
returns trigger as $$
begin
  if new.job_number is null or new.job_number = '' then
    new.job_number := nextval('job_number_seq')::text;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_jobs_set_number
  before insert on jobs
  for each row execute function set_job_number();
