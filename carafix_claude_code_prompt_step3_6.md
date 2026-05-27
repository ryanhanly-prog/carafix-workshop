# Shopbook Step 3.6 — Job Type Taxonomy + Full Historical Import

Two prerequisites for Step 4 (AI quoting). Both unlock the "hours suggester" feature by giving it clean groupings and enough data to be statistically meaningful.

## Mode

Opus 4.7, auto mode. Run end-to-end without checkpoints. Show a brief plan, then proceed.

Commit after each block.

---

## Context — why this step

Step 3 imported a sample of Mechanic Desk data via CSV. That sample had 41 historical invoices — enough to verify the pipeline, not enough to power AI features. The user has now pulled the full Carafix historical export (3+ years, ~15,000 invoices, ~72,000 line items, ~10,800 timesheets). That file sits at:

```
C:\Users\ryanj\Documents\carafix\full-historical-import\export-15186-27_05_2026-07-35.zip
```

(Find it via `ls` if the path differs. Confirm with the user if not present.)

This file contains additional data types beyond the sample: Jobs.csv, Timesheets.csv, Vehicles.csv, Bills.csv, Purchase Orders, Emails. **Don't try to import all of these.** Focus on what powers Step 4.

The data also revealed that Mechanic Desk's `First Job Type` field is inconsistently labelled — same job appears under 10+ different names. For the hours-suggester to work, we need a canonical taxonomy and a mapping layer.

---

## Block order

```
A. Job-type taxonomy schema + canonical seed list
B. Job-type aliasing UI for Catherine (admin screen)
C. Extend import schema for Jobs + Timesheets + Vehicles
D. Run the full historical import via existing UI
E. Verify queryable corpus, surface stats to the user
F. Commit + push
```

---

## Block A — Job-type taxonomy schema

### A1. Migration `0018_job_type_taxonomy.sql`

```sql
-- Canonical job types: the clean, deduplicated list Carafix uses for analytics + AI
create table job_type_canonical (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  slug text not null,                           -- 'tandem_axle_service' — stable identifier
  name text not null,                           -- 'Tandem Axle Service' — display name
  category text,                                -- 'service' | 'repair' | 'insurance' | 'inspection' | 'upgrade' | 'other'
  description text,                             -- optional explanation
  active boolean default true,
  display_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (organisation_id, slug)
);

-- Aliases: the raw text from Mechanic Desk / free-text input that maps to a canonical type
create table job_type_aliases (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  raw_value text not null,                      -- 'AXLE SERVICE - TANDEM AXLE' — exact text as it appears in source
  canonical_id uuid references job_type_canonical(id) on delete set null,
  occurrence_count int default 0,               -- how many times we've seen this raw value (for prioritising mapping work)
  last_seen timestamptz default now(),
  created_at timestamptz default now(),
  unique (organisation_id, raw_value)
);

create index idx_job_type_aliases_canonical on job_type_aliases(canonical_id);
create index idx_job_type_aliases_unmapped on job_type_aliases(organisation_id) where canonical_id is null;

-- RLS — standard org-scoped pattern
alter table job_type_canonical enable row level security;
alter table job_type_aliases enable row level security;

create policy "users see canonical types in their org" on job_type_canonical
  for all using (organisation_id = current_user_org_id())
  with check (organisation_id = current_user_org_id());

create policy "users see aliases in their org" on job_type_aliases
  for all using (organisation_id = current_user_org_id())
  with check (organisation_id = current_user_org_id());
```

### A2. Seed the canonical list for Carafix

Based on the corpus analysis, seed these 18 canonical types for the Carafix organisation. These are the actual buckets that 90%+ of Carafix work falls into:

```sql
insert into job_type_canonical (organisation_id, slug, name, category, display_order) values
  -- Services (most common, well-defined)
  ('00000000-0000-0000-0000-000000000002', 'tandem_axle_service',   'Tandem Axle Service',     'service',    10),
  ('00000000-0000-0000-0000-000000000002', 'single_axle_service',   'Single Axle Service',     'service',    20),
  ('00000000-0000-0000-0000-000000000002', 'first_service',         'First Service',           'service',    30),
  ('00000000-0000-0000-0000-000000000002', 'annual_service',        'Annual / 12-Month Service','service',   40),
  ('00000000-0000-0000-0000-000000000002', 'logbook_service',       'Logbook Service',         'service',    50),
  ('00000000-0000-0000-0000-000000000002', 'slide_out_service',     'Slide Out Service',       'service',    60),
  -- Insurance work
  ('00000000-0000-0000-0000-000000000002', 'insurance_inspection',  'Insurance Inspection',    'insurance',  70),
  ('00000000-0000-0000-0000-000000000002', 'insurance_repair',      'Insurance Repair',        'insurance',  80),
  ('00000000-0000-0000-0000-000000000002', 'storm_damage',          'Storm Damage Repair',     'insurance',  90),
  ('00000000-0000-0000-0000-000000000002', 'impact_damage',         'Impact / Collision Repair','insurance', 100),
  -- Repairs (general)
  ('00000000-0000-0000-0000-000000000002', 'water_damage',          'Water Damage / Leak Repair','repair',  110),
  ('00000000-0000-0000-0000-000000000002', 'awning_repair',         'Awning Repair / Replace', 'repair',    120),
  ('00000000-0000-0000-0000-000000000002', 'electrical_repair',     'Electrical Repair',       'repair',    130),
  ('00000000-0000-0000-0000-000000000002', 'plumbing_gas_repair',   'Plumbing / Gas Repair',   'repair',    140),
  ('00000000-0000-0000-0000-000000000002', 'chassis_suspension',    'Chassis / Suspension',    'repair',    150),
  -- Inspections + upgrades
  ('00000000-0000-0000-0000-000000000002', 'pre_purchase_inspection','Pre-Purchase Inspection','inspection',160),
  ('00000000-0000-0000-0000-000000000002', 'warranty_work',         'Warranty Work',           'warranty',  170),
  ('00000000-0000-0000-0000-000000000002', 'upgrade_install',       'Upgrade / Installation',  'upgrade',   180),
  -- Catch-all
  ('00000000-0000-0000-0000-000000000002', 'other',                 'Other',                   'other',     999);
```

### A3. Auto-suggest aliases on import

When the historical import runs (Block D), every distinct `First Job Type` value seen in `Invoices Summary.csv` and `Quotes.csv` gets:
- An entry in `job_type_aliases` with the raw text
- `occurrence_count` set to how many times that raw value appears
- `canonical_id` set to `NULL` initially (waiting for user mapping)

Use a string-similarity heuristic to **suggest** canonical mappings (not auto-apply — Catherine confirms). Pre-populate the suggestion in a `suggested_canonical_id` column on the alias:

```sql
alter table job_type_aliases add column suggested_canonical_id uuid references job_type_canonical(id);
alter table job_type_aliases add column suggestion_confidence numeric;  -- 0..1
```

Simple suggestion algorithm (no LLM needed):
- Lowercase + normalise the raw value
- Compute Jaccard similarity of word-tokens against each canonical name + slug
- If max similarity > 0.5, suggest that canonical with confidence = similarity
- If no match > 0.5, leave suggested as NULL

### A4. Commit

`Step 3.6a: job-type taxonomy schema + 18 canonical types for Carafix`

---

## Block B — Aliasing UI (Catherine's screen)

A new admin screen where Catherine can clean up the job-type mapping. This is the small piece of human work that makes the AI features 10x more useful.

### B1. Route: `/settings/job-types`

Add under Settings (currently a stub). Two tabs:

- **Canonical types** — list of the 18 seeded types, editable (rename, deactivate, add new)
- **Aliases** — unmapped + mapped raw values from the import, grouped by occurrence

### B2. Aliases tab — the core screen

A two-pane layout:

**Left pane: unmapped aliases**
- Table of all `job_type_aliases` where `canonical_id IS NULL`
- Columns: Raw value, Occurrence count, Last seen, Suggested mapping (with confidence %)
- Sorted by occurrence_count DESC (most common unmapped first)
- Each row has a dropdown to pick the canonical type to map to + a "Confirm" button

**Right pane: mapped aliases (collapsed by canonical)**
- Grouped by canonical type
- Each group shows: canonical name → list of raw values mapped to it
- "Unmap" button per alias if she made a mistake

### B3. Bulk operations

At the top of the unmapped list:
- "Accept all suggestions" button — applies every suggestion with confidence > 0.7
- "Map to 'Other'" bulk action — for the long tail of one-off junk values

### B4. Update job_type_aliases over time

Whenever a new import runs:
- If the raw value already has a `canonical_id` set, leave it alone (Catherine's mapping wins)
- If it's new, add an alias row with NULL canonical_id + a fresh suggestion
- Increment `occurrence_count`

This way her mapping work is **one-time per new raw value**, not per import.

### B5. Helper function for queries

```sql
-- Get canonical job type for any raw value (or NULL if unmapped)
create or replace function canonical_job_type(raw_text text)
returns uuid
language sql
stable
as $$
  select canonical_id
  from job_type_aliases
  where organisation_id = current_user_org_id()
    and raw_value = raw_text
$$;
```

Used by Step 4's hours-suggester to translate Mechanic Desk's raw labels into the canonical groupings.

### B6. Commit

`Step 3.6b: aliasing UI for Catherine, suggestion algorithm`

---

## Block C — Extend import schema

The full historical export contains data types we didn't import in Step 3. Add the schema for the strategically important ones.

### C1. Migration `0019_extended_import_tables.sql`

```sql
-- Vehicles: the caravan registry, more authoritative than the denormalised invoice data
create table historical_vehicles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  external_id text,                             -- MD UUID
  vehicle_number text,
  registration_number text,
  fleet_number text,
  chassis_number text,
  vin text,
  make text,
  model text,
  year text,
  customer_external_id text,                    -- which customer owns this van
  customer_name text,
  notes text,
  imported_at timestamptz default now(),
  import_batch_id uuid references import_batches(id),
  unique (organisation_id, external_id)
);

create index idx_hist_vehicles_make_model on historical_vehicles(organisation_id, make, model);
create index idx_hist_vehicles_customer on historical_vehicles(organisation_id, customer_external_id);

-- Jobs: the master job record (more detail than what's denormalised on invoices)
create table historical_jobs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  job_number text not null,                     -- '23', '1157', etc.
  status text,
  key_tag text,
  vehicle_external_id text,
  vehicle_number text,
  registration_number text,
  customer_external_id text,
  customer_number text,
  customer_name text,
  job_type_raw text,                            -- raw MD value
  job_type_canonical_id uuid references job_type_canonical(id),
  description text,
  pickup_time timestamptz,
  start_time timestamptz,
  finish_time timestamptz,
  estimate_hours numeric,                       -- mostly empty in MD, captured anyway
  finished_by text,
  on_hold boolean,
  on_hold_reason text,
  odometer text,
  comments text,
  internal_notes text,
  tags text,
  invoice_number text,                          -- link to historical_invoices
  next_service_date date,
  booked_by text,
  created_by text,
  created_date date,
  imported_at timestamptz default now(),
  import_batch_id uuid references import_batches(id),
  unique (organisation_id, job_number)
);

create index idx_hist_jobs_job_type on historical_jobs(organisation_id, job_type_canonical_id);
create index idx_hist_jobs_invoice on historical_jobs(organisation_id, invoice_number);
create index idx_hist_jobs_vehicle on historical_jobs(organisation_id, vehicle_external_id);

-- Timesheets: the truth on actual labour hours
create table historical_timesheets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  date date,
  job_number text,                              -- links to historical_jobs.job_number
  job_title text,
  job_description text,
  job_status text,
  customer_name text,
  employee text,                                -- tech name
  start_time text,                              -- raw text, not parsed (varies)
  end_time text,
  comment text,
  total_hours numeric,
  is_internal_no_charge boolean,
  overtime boolean,
  effective_hours numeric,
  charged_hours numeric,
  amount_charged numeric,
  invoice_item_description text,
  registration_number text,
  fleet_number text,
  imported_at timestamptz default now(),
  import_batch_id uuid references import_batches(id)
);

create index idx_hist_timesheets_job on historical_timesheets(organisation_id, job_number);
create index idx_hist_timesheets_employee on historical_timesheets(organisation_id, employee);
create index idx_hist_timesheets_date on historical_timesheets(organisation_id, date desc);

-- RLS for all three
alter table historical_vehicles enable row level security;
alter table historical_jobs enable row level security;
alter table historical_timesheets enable row level security;

create policy "users see hist_vehicles in their org" on historical_vehicles
  for all using (organisation_id = current_user_org_id())
  with check (organisation_id = current_user_org_id());
create policy "users see hist_jobs in their org" on historical_jobs
  for all using (organisation_id = current_user_org_id())
  with check (organisation_id = current_user_org_id());
create policy "users see hist_timesheets in their org" on historical_timesheets
  for all using (organisation_id = current_user_org_id())
  with check (organisation_id = current_user_org_id());
```

### C2. Add canonical_id back-link on historical_invoices

```sql
alter table historical_invoices add column job_type_canonical_id uuid references job_type_canonical(id);
create index idx_hist_invoices_canonical_jt on historical_invoices(organisation_id, job_type_canonical_id);
```

Backfill on import: for every row, look up the raw `first_job_type` in `job_type_aliases` and set the canonical_id if found.

### C3. Extend the import pipeline

Update `src/lib/import/mechanic-desk.ts` to parse three new CSV types:

- `Vehicles.csv` → `historical_vehicles`
- `Jobs.csv` → `historical_jobs`
- `Timesheets.csv` → `historical_timesheets`

Plus the back-link logic on `historical_invoices` and `historical_jobs`.

Don't parse: Bills, Bill Items, Purchase Orders, Purchase Order Items, Emails, Credit Notes, Customer Contacts, Job Type Summaries, Job Type Invoice Items, Job Type Checklists. These are out of scope for Step 4.

### C4. The "warn don't fail" rule

If a CSV inside the ZIP is malformed or empty, log it as a skipped file and continue. Don't fail the whole batch on one bad file. Surface skipped files in the import history UI.

### C5. Commit

`Step 3.6c: schema + parsers for vehicles, jobs, timesheets`

---

## Block D — Run the full historical import

Once the schema is in place, run the actual import against the user's full export.

### D1. Pre-flight check

Before importing, verify file exists:

```bash
ls -la "C:\Users\ryanj\Documents\carafix\full-historical-import\"
```

If the ZIP is there, proceed. If not, ask the user where it is.

### D2. Run via the existing UI

Don't write a one-off script. Use the existing `/imports` UI by:
- The user drags the ZIP onto the drop zone, OR
- Use the server action directly if testing in dev

Expected scale (per the prior analysis):
- 3,504 customers (mostly updates from prior import)
- 5,441 stock items (mostly updates)
- 449 suppliers (significant new — was 181 from sample)
- 15,421 invoices (vast majority new)
- 71,623 invoice items (vast majority new)
- 1,814 quotes (vast majority new)
- 19,506 quote items (vast majority new)
- 2,873 vehicles (NEW table)
- 7,109 jobs (NEW table)
- 10,804 timesheets (NEW table)

Plus the auto-population of `job_type_aliases` with every distinct `First Job Type` value seen.

### D3. Performance considerations

This is a big import — ~120,000 rows total. Watch for:

- **Batch size**: 500 rows per insert is fine for the small tables; consider 1,000 for the line-item tables.
- **Memory**: stream the CSV parsing, don't load whole files into memory if it's blowing past 1GB.
- **Time**: expect 5-15 minutes total. Surface progress in the UI so the user knows it's working.
- **Idempotency**: re-running the same ZIP must not duplicate. Confirm with a second-pass dry run after.

### D4. Verification queries

After the import completes, run via MCP and print results:

```sql
-- Volume check
select 'customers' as table_name, count(*) from customers
union all select 'stock_items', count(*) from stock_items
union all select 'suppliers', count(*) from suppliers
union all select 'historical_invoices', count(*) from historical_invoices
union all select 'historical_invoice_items', count(*) from historical_invoice_items
union all select 'historical_quotes', count(*) from historical_quotes
union all select 'historical_quote_items', count(*) from historical_quote_items
union all select 'historical_vehicles', count(*) from historical_vehicles
union all select 'historical_jobs', count(*) from historical_jobs
union all select 'historical_timesheets', count(*) from historical_timesheets
order by table_name;

-- Job-type aliases discovered
select count(*) as total_aliases,
       count(*) filter (where canonical_id is not null) as mapped,
       count(*) filter (where canonical_id is null) as unmapped,
       count(*) filter (where suggested_canonical_id is not null and canonical_id is null) as suggested_pending
from job_type_aliases;

-- Top 20 most common unmapped aliases (these are the ones Catherine should map first)
select raw_value, occurrence_count, 
       (select name from job_type_canonical where id = suggested_canonical_id) as suggested
from job_type_aliases
where canonical_id is null
order by occurrence_count desc
limit 20;

-- Sanity: are the timesheets joinable to jobs?
select count(*) as timesheets_with_matching_job
from historical_timesheets t
where exists (select 1 from historical_jobs j where j.job_number = t.job_number);
```

### D5. Commit

`Step 3.6d: full historical import — 3 years of Carafix data ingested`

---

## Block E — Surface stats to the user

After the import, give the user something to look at. Two small additions:

### E1. Imports history — show entity totals

The Imports page already shows per-batch totals. After this big import, the user should see a summary chip:

> "Latest import: 15,421 invoices · 71,623 line items · 1,814 quotes · 7,109 jobs · 10,804 timesheets"

### E2. Job-types screen — show how much work is waiting

The `/settings/job-types` Aliases tab should prominently display:

> "**[N] unmapped job types** covering [M]% of historical work. Map the top 20 to unlock job-type analytics."

This is the call-to-action for Catherine. After she maps the top 20-50, ~90% of the corpus will have a clean canonical mapping.

### E3. Commit

`Step 3.6e: imports + job-types stats surfaced`

---

## Block F — Wrap-up

### F1. Build green

`npm run build` must succeed. Fix any TypeScript errors caused by the new tables.

### F2. Regenerate types

```bash
npx supabase gen types typescript --project-id uckshjquyupolwwglacm > src/lib/database.types.ts
```

### F3. Push

```bash
git push origin main
```

### F4. Final summary

In your final message, document:
- Migration numbers used (should be 0018, 0019)
- Row counts from the full import
- Number of unmapped job-type aliases (so user knows the work Catherine has ahead)
- Top 5 most common unmapped raw values
- Suggested next move: Catherine spends 15 min mapping top aliases, then Step 4 starts

---

## Out of scope (explicit)

- AI quoting itself (Step 4)
- Hours-suggester UI (Step 4)
- Quoted-vs-actual report (Step 4 or 5)
- Importing Bills, Purchase Orders, Emails, Credit Notes (later, if needed)
- Importing Job Type Summaries / Checklists (later)
- Mobile or schedule-grid UI (deferred indefinitely until Step 4 proves out)

## Critical reminders

1. **The 18 canonical types are a seed, not final.** Catherine will edit/extend them. Make sure the UI supports rename + add + deactivate.
2. **The string-similarity suggester is a starting point.** Don't auto-apply — Catherine confirms every mapping. Wrong auto-mappings poison the analytics.
3. **The full import is large.** Test with reasonable batch sizes. If memory becomes an issue, stream rather than load.
4. **Don't re-import data already in the database.** The Step 3 sample import added 41 invoices and 3,504 customers — those should mostly become **updates** when the full import runs, not inserts. Idempotency via `external_id` upsert.
5. **Don't try to be clever about job→invoice→timesheet linking yet.** Just import each table cleanly. The cross-table joins happen in Step 4 when the hours-suggester query is written.

Show the plan briefly, then run end-to-end.
