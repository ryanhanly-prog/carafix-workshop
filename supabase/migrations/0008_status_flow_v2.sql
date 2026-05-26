-- Carafix's real status lifecycle replaces the v1 placeholder flow.
--
-- We use ALTER TYPE ... RENAME VALUE rather than dropping/recreating the enum:
-- renames are in-place and lossless, so jobs.status, its default, and the
-- historical job_status_log.from_status/to_status rows all carry over with no
-- data migration. ADD VALUE ... BEFORE positions the brand-new 'Completed'
-- state correctly in the lifecycle order.
--
-- Final order: Booked, Arrived, In Progress, On Hold, Completed, QA Check,
-- Invoiced, Picked Up.

alter type job_status rename value 'Booked In' to 'Booked';
alter type job_status rename value 'Waiting to Start' to 'Arrived';
alter type job_status rename value 'Waiting on Parts' to 'On Hold';
alter type job_status rename value 'Ready for Pickup' to 'Invoiced';

-- 'Completed' = work done, awaiting QA. New state, no existing rows use it.
alter type job_status add value if not exists 'Completed' before 'QA Check';

-- Reason a job is parked, required by the app only when status = 'On Hold'.
alter table jobs add column hold_reason text;
