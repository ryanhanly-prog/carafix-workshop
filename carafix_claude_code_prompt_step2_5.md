# Carafix Step 2.5 — Refinements + Dashboard Widgets

Paste this into Claude Code after Step 2 is verified working.

---

This is a refinement pass based on real user feedback from the workshop owner. Step 2 is working but needs labels, statuses, and field structure that match how Carafix actually operates. Then we add the dashboard the controller wants for her "morning snapshot".

Goal: end of this session, the Jobs list, Job Detail page, and Dashboard all match Carafix's real-world workflow. Quoting tool work comes in Step 3.

## Plan and confirm before coding

Show me the migration plan, the rename map, and the dashboard widget design before writing any code. Wait for my approval. The data changes here affect existing seed data, so I want to spot issues at plan time.

---

## Part A — Schema refinements

### 1. Status flow — replace with the real Carafix flow

Migration `0006_status_flow_v2.sql`:

The current `job_status` enum is wrong. Drop it and replace with the actual Carafix status list. Order is meaningful — it's the lifecycle a job moves through.

```sql
-- Carafix's actual status flow, in order:
-- 1. Booked            (was 'Booked In')
-- 2. Arrived           (was 'Waiting to Start' — van is here, work not started)
-- 3. In Progress       (unchanged)
-- 4. On Hold           (NEW — replaces 'Waiting on Parts'; reason captured separately)
-- 5. Completed         (NEW — work done, awaiting QA)
-- 6. QA Check          (was 'QA Check')
-- 7. Invoiced          (NEW — invoice issued; was 'Ready for Pickup')
-- 8. Picked Up         (unchanged)
```

Migrate existing data carefully:
- `Booked In` → `Booked`
- `Waiting to Start` → `Arrived`
- `In Progress` → `In Progress`
- `Waiting on Parts` → `On Hold` (and set `hold_reason = 'Waiting on parts'`)
- `QA Check` → `QA Check`
- `Ready for Pickup` → `Invoiced`
- `Picked Up` → `Picked Up`

The "Completed" status is new — no existing rows will have it; the controller will use it going forward.

Don't drop the old enum until existing data is migrated cleanly. Use a temp column + UPDATE pattern, or rename via PostgreSQL's `ALTER TYPE ... RENAME VALUE` if the enum values change one at a time.

### 2. Add `hold_reason` field

Same migration, add a nullable text field:

```sql
alter table jobs add column hold_reason text;
```

Validation in the app: if `status = 'On Hold'`, `hold_reason` is required. Otherwise it should be null. Show the field conditionally in the UI (only when status is On Hold).

Options for hold_reason (use a constant in TypeScript, not an enum — these may need to grow over time):

- Waiting on parts
- Waiting on customer
- Waiting on insurer approval
- Waiting on assessor
- Other

When "Other" is selected, prompt for free text appended to the reason (e.g. "Other: customer overseas until 12 June").

### 3. Rename + split work_type and category

Current state (after Step 2):
- `jobs.category` — Private | Insurance | Warranty | Dealer
- `jobs.work_type` — Service | Repair | Pre-purchase inspection | Modification | Other

These names confused the user. Rename to make the distinction obvious:

```sql
-- Rename category → billing_type with new options
alter type job_category rename to billing_type;
-- Keep the same values: Private, Insurance, Warranty, Dealer
-- (Same enum, just clearer name)

alter table jobs rename column category to billing_type;

-- Replace work_type with the user's actual list
-- Drop old, create new
alter table jobs drop column work_type;
create type job_type as enum (
  'Servicing',
  'Repairs',
  'Insurance Repair',
  'Warranty Work',
  'Upgrades & Installation',
  'Other'
);
alter table jobs add column job_type job_type;
```

Wait — there's a subtle problem here. The original work_type list I proposed (Service, Repair, etc.) didn't overlap with billing_type. But the user's preferred list DOES include "Insurance Repair" and "Warranty Work" which overlap with billing_type. Resolve this:

**Use this final list for job_type** (orthogonal to billing_type, no overlap):

- Servicing
- Repairs
- Upgrades & Installation
- Other

The "Insurance" / "Warranty" dimension is captured fully by `billing_type`. A job can be "Servicing + Insurance" or "Repairs + Private" — both dimensions independent. This avoids the duplication and matches the user's stated intent that the two fields should be distinct.

Confirm this resolution with me before applying the migration if you have a different read.

### 4. Date field rename + new field

Migration `0007_date_fields.sql`:

Three changes:

```sql
-- Rename booked_in_date → booking_date (date the booking was made/recorded)
alter table jobs rename column booked_in_date to booking_date;

-- Rename planned_start_date → job_start_date (date the work actually starts)
alter table jobs rename column planned_start_date to job_start_date;

-- Add customer_promised_date — the date the customer expects to collect the van
alter table jobs add column customer_promised_date date;
```

In the UI:
- "Booked In" label → "Booking date"
- "Planned start" label → "Job start date"  
- New "Customer promised date" label, shown prominently on the job detail page

### 5. Make customer_promised_date the urgency driver

The `is_delayed` flag previously fired on `expected_finish_date`. Add a second urgency signal that uses `customer_promised_date`:

```sql
-- Updated view: v_job_rollup
-- Add is_urgent flag:
-- TRUE when customer_promised_date is within 2 working days
-- AND status not in ('Invoiced', 'Picked Up')
```

In the rollup view, compute:

```sql
case
  when customer_promised_date is not null
   and customer_promised_date <= current_date + interval '2 days'
   and status not in ('Invoiced', 'Picked Up')
  then true else false
end as is_urgent
```

Show a flashing/pulsing red badge "URGENT — customer collecting [date]" on the job row when this is true. This is the priority signal the user asked for.

### 6. Delayed flag still works, slight refinement

`is_delayed` continues to fire on `expected_finish_date`, but update its exclusion list to match the new status names:

```sql
case
  when current_date > expected_finish_date
   and status not in ('Completed', 'QA Check', 'Invoiced', 'Picked Up')
  then true else false
end as is_delayed
```

Both flags can fire on the same job (delayed AND urgent) — show both badges.

### 7. Update seed data

Migration `0008_reseed_demo_data.sql`:

The 8 demo jobs need their statuses, categories, and field names updated to match the new schema. Also:

- Add `customer_promised_date` to all 8 jobs — pick dates that demonstrate the urgent flag firing on at least 1-2 of them
- Ensure at least one job is `On Hold` with `hold_reason = 'Waiting on parts'`
- Ensure at least one job is `Completed` (the post-work, pre-QA state)
- Spread `booking_date` values across the past 2-3 weeks
- `job_start_date` should differ from `booking_date` by at least a few days for realism

Keep the same 8 customer/van combos so URLs in the existing screenshots don't change.

---

## Part B — UI refinements

### Status badge colours

Update the colour map:

| Status | Colour | Tailwind class hint |
|---|---|---|
| Booked | Slate / grey | `bg-slate-100 text-slate-700` |
| Arrived | Amber | `bg-amber-100 text-amber-800` |
| In Progress | Blue | `bg-blue-100 text-blue-800` |
| On Hold | Orange | `bg-orange-100 text-orange-800` |
| Completed | Teal | `bg-teal-100 text-teal-800` |
| QA Check | Purple | `bg-purple-100 text-purple-800` |
| Invoiced | Emerald | `bg-emerald-100 text-emerald-800` |
| Picked Up | Muted | `bg-gray-100 text-gray-500` |

Plus flag badges:
- Delayed: red, with warning triangle icon
- Urgent: red, with clock icon, slight pulse animation
- Pickup ready: green tick (derived: status = Invoiced)

### Status change dropdown

When the user clicks the status badge to change it, the dropdown should:

- Show statuses in their canonical order (not alphabetical)
- Highlight the "natural next" status based on current (e.g. if currently `Arrived`, highlight `In Progress`)
- If new status is `On Hold`, require `hold_reason` to be filled in same dialog
- Log to `job_status_log` with optional reason text (existing trigger)

### Job Detail page — header updates

The header section should display:

- Job number (large, as is)
- Customer name + van make/model/rego (as is)
- **Booking date** (e.g. "Booking: 17 May 2026")
- **Job start date** (e.g. "Job starts: 19 May 2026")
- **Customer promised date** (e.g. "Customer collecting: 28 May 2026") — **prominent**, bold, with the URGENT badge inline if applicable
- **Expected finish date** (e.g. "Expected finish: 25 May 2026") — show with red highlight if past today
- Status badge (clickable)
- Billing type badge (Private/Insurance/Warranty/Dealer)
- Job type label (Servicing/Repairs/etc.)
- Hold reason (if on hold)

### Job list page — column updates

Reorder columns to:

1. Job #
2. Customer
3. Van
4. Job type *(new)*
5. Billing type *(renamed from Category)*
6. Status (badge)
7. Priority
8. Tech
9. Booking *(renamed from Booked in)*
10. Job start *(renamed from Planned start)*
11. **Customer due *(new — customer_promised_date — highlight red if urgent)**
12. Expected finish
13. Flags (delayed + urgent + pickup-ready)

### New Job form — field updates

In the form:

- Rename "Category" → "Billing type"
- Replace "Work type" with `job_type` enum (Servicing, Repairs, Upgrades & Installation, Other)
- Rename "Planned start date" → "Job start date"
- Add "Customer promised pickup date" field (date picker, optional)
- Add a "Booking date" field that defaults to today (date picker, editable — controller might book a van in for a future date)
- "Bay" stays as an optional field at the end of the form (don't hide, but it's clearly low priority)

---

## Part C — Dashboard widgets

The `/` route is currently a stub. Build it out as the controller's daily snapshot. Six widgets in a responsive grid (2 columns on desktop, 1 on mobile).

### Widget 1 — Today's snapshot (top, full width)

A compact strip showing:
- Total active jobs at this location
- Jobs in progress now
- Jobs urgent (customer due within 2 days)
- Jobs delayed
- Parts waiting (count of parts with status `Needed` or `Ordered` for this location)

Each is clickable → takes you to the relevant filtered view of the Jobs or Parts page.

### Widget 2 — In progress today

List of all jobs with status `In Progress` at this location, with:
- Job number + customer surname
- Tech assigned (with dot colour)
- **Progress indicator**: "Day 2 of 4" — calculated from `job_start_date` and `expected_finish_date` (working days only). If quoted_hours and we have any time tracking, show "Hour 8 of 12" instead.
- Click → opens job detail

If no jobs in progress, show empty state: "No jobs in progress. Start the next one from the queue."

### Widget 3 — Ending today

List of jobs where `expected_finish_date = today` and status not in (`Completed`, `QA Check`, `Invoiced`, `Picked Up`). Each row: job #, customer, tech, current status. Click → job detail.

Empty state: "Nothing finishing today."

### Widget 4 — Ready to start

List of jobs where status is `Booked` or `Arrived` and `job_start_date <= today + 1 day` (today or tomorrow). Each row: job #, customer, tech, job_start_date. Click → job detail.

Empty state: "Nothing queued for the next 2 days."

### Widget 5 — Customer collecting soon

List of jobs sorted by `customer_promised_date` ascending, filtered to next 7 days, status not `Picked Up`. Each row: job #, customer, current status, customer_promised_date with urgent badge if within 2 days. This is the priority surface the user explicitly asked for.

Empty state: "No upcoming pickups."

### Widget 6 — Picked up today, not invoiced

List of jobs where `picked_up_date = today` and `invoice_status != 'Complete'`. Compliance/cashflow signal — these need invoicing. Each row: job #, customer, total value if available. Click → job detail.

Empty state: "All today's pickups invoiced."

### Layout

Desktop:
```
[ Snapshot strip — full width ]
[ In Progress today ] [ Ending today ]
[ Ready to start    ] [ Customer collecting soon ]
[ Picked up not invoiced — full width ]
```

Mobile: stack vertically.

Use shadcn `Card` components. Each widget has a title, the list (or empty state), and a "View all" link if there are more than 5 items. Lists never show more than 5 items inline.

Keep colours muted overall — let the flags and badges be the colour. A serene dashboard with one or two angry-looking widgets is a good design.

---

## Out of scope for this session

- Mechanic Desk CSV import (Step 3)
- Quote authoring tool (Step 4)
- Schedule grid / Kanban (later)
- Mobile tech view (later)
- Photo uploads (later)
- AI briefing (later)

## When you're done

1. Verify `npm run build` succeeds
2. Re-run the seed (verify the 8 demo jobs migrated cleanly, statuses updated, customer_promised_date populated)
3. Smoke-test: log in, switch locations, check Jobs page reflects new columns, open a job detail page, change status to On Hold and verify reason field appears, visit Dashboard and verify all 6 widgets render
4. Commit + push to GitHub with message: "Step 2.5: Carafix status flow, label refinements, customer pickup priority, dashboard widgets"
5. Tell me the route map and confirm what's left for Step 3

Show me the plan before coding. Wait for "proceed".
