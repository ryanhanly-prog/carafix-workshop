-- Refresh v_job_rollup for the new status flow + the customer-pickup priority
-- signal the controller asked for. Dropped + recreated (not REPLACE) because
-- we insert customer_promised_date mid-list and change is_pickup_ready's
-- meaning. security_invoker is re-applied so the view keeps honouring the
-- caller's RLS (set originally in 0007).

drop view if exists v_job_rollup;

create view v_job_rollup as
select
  j.id as job_id,
  j.job_number,
  j.location_id,
  j.status,
  j.expected_finish_date,
  j.customer_promised_date,
  j.invoice_status,
  coalesce(sum(t.quoted_hours), 0) as total_quoted_hours,
  ceil((coalesce(sum(t.quoted_hours), 0) / 6.5) * 2) / 2.0 as estimated_days,
  max(t.scheduled_date) as last_scheduled_date,
  count(t.id) as task_count,
  count(t.id) filter (where t.status = 'Done') as tasks_done,
  -- Delayed: past the expected finish and still live work.
  case
    when current_date > j.expected_finish_date
     and j.status not in ('Completed', 'QA Check', 'Invoiced', 'Picked Up')
    then true else false
  end as is_delayed,
  -- Urgent: customer collecting within 2 days and the van hasn't been
  -- invoiced/collected yet. This is the priority surface for the workshop.
  case
    when j.customer_promised_date is not null
     and j.customer_promised_date <= current_date + interval '2 days'
     and j.status not in ('Invoiced', 'Picked Up')
    then true else false
  end as is_urgent,
  -- Pickup ready now means simply: the invoice has been issued.
  case
    when j.status = 'Invoiced' then true else false
  end as is_pickup_ready
from jobs j
left join tasks t on t.job_id = j.id
group by j.id;

alter view v_job_rollup set (security_invoker = true);
