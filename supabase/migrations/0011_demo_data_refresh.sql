-- Non-destructive demo refresh. The live DB had diverged from the original
-- seed (the 8 demo jobs 100001-100008 plus 2 manually-added test jobs, and one
-- hand-edited status), so instead of a destructive re-seed we UPDATE in place
-- keyed on the stable job_number. This preserves every row's UUID, so the job
-- URLs in existing screenshots keep working, and no status history is wiped.
--
-- Dates are anchored to the seed date (2026-05-26) so the urgent/delayed flags
-- and the dashboard widgets all have something to show on day one. They are
-- static (not current_date-relative) so the demo reads consistently.

-- 100001 Margaret Whitlam (Arundel, Insurance) — in progress, finishing today,
-- customer collecting in 2 days (urgent).
update jobs set
  status = 'In Progress',
  booking_date = '2026-05-08',
  job_start_date = '2026-05-20',
  expected_finish_date = '2026-05-26',
  customer_promised_date = '2026-05-28',
  invoice_status = 'Not Invoiced',
  hold_reason = null
where job_number = '100001';

-- 100002 Bruce Camilleri (Currumbin, Private) — booked, starts tomorrow.
update jobs set
  status = 'Booked',
  booking_date = '2026-05-22',
  job_start_date = '2026-05-27',
  expected_finish_date = '2026-06-02',
  customer_promised_date = '2026-06-05',
  hold_reason = null
where job_number = '100002';

-- 100003 Dawn Fitzgerald (Arundel, Warranty) — arrived, starts today.
update jobs set
  status = 'Arrived',
  booking_date = '2026-05-19',
  job_start_date = '2026-05-26',
  expected_finish_date = '2026-05-30',
  customer_promised_date = '2026-06-01',
  hold_reason = null
where job_number = '100003';

-- 100004 Trevor Nguyen (Currumbin, Private) — booked, starts later this week.
update jobs set
  status = 'Booked',
  booking_date = '2026-05-25',
  job_start_date = '2026-05-29',
  expected_finish_date = '2026-06-04',
  customer_promised_date = '2026-06-06',
  hold_reason = null
where job_number = '100004';

-- 100005 Janelle Hargreaves (Arundel, Private) — overdue AND collecting
-- tomorrow: demonstrates the delayed + urgent badges firing together.
update jobs set
  status = 'In Progress',
  booking_date = '2026-05-06',
  job_start_date = '2026-05-11',
  expected_finish_date = '2026-05-22',
  customer_promised_date = '2026-05-27',
  invoice_status = 'Not Invoiced',
  hold_reason = null
where job_number = '100005';

-- 100006 Wayne Petersen (Currumbin, Dealer) — work done, awaiting QA: the new
-- 'Completed' state.
update jobs set
  status = 'Completed',
  booking_date = '2026-05-12',
  job_start_date = '2026-05-15',
  expected_finish_date = '2026-05-25',
  customer_promised_date = '2026-05-29',
  invoice_status = 'Draft',
  hold_reason = null
where job_number = '100006';

-- 100007 Coral Mibus (Arundel, Private) — on hold waiting on parts (has an
-- outstanding ordered part), so it carries a hold_reason.
update jobs set
  status = 'On Hold',
  booking_date = '2026-05-13',
  job_start_date = '2026-05-23',
  expected_finish_date = '2026-06-02',
  customer_promised_date = '2026-06-03',
  hold_reason = 'Waiting on parts'
where job_number = '100007';

-- 100008 Gary Polson (Arundel, Private) — invoiced and ready for pickup,
-- collecting tomorrow.
update jobs set
  status = 'Invoiced',
  booking_date = '2026-05-15',
  job_start_date = '2026-05-18',
  expected_finish_date = '2026-05-24',
  customer_promised_date = '2026-05-27',
  invoice_status = 'Complete',
  hold_reason = null
where job_number = '100008';

-- 100009 Cath Hanly (Arundel, Private) — picked up today but not yet invoiced:
-- the cashflow/compliance signal in widget 6.
update jobs set
  status = 'Picked Up',
  booking_date = '2026-05-09',
  job_start_date = '2026-05-13',
  expected_finish_date = '2026-05-20',
  customer_promised_date = '2026-05-22',
  picked_up_date = '2026-05-26',
  invoice_status = 'Draft',
  hold_reason = null
where job_number = '100009';

-- 100010 Stella Hanly (Arundel, Insurance) — in QA.
update jobs set
  status = 'QA Check',
  booking_date = '2026-05-18',
  job_start_date = '2026-05-21',
  expected_finish_date = '2026-05-29',
  customer_promised_date = '2026-06-02',
  hold_reason = null
where job_number = '100010';
