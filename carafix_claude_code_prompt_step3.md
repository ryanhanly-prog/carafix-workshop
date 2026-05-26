# Shopbook Step 3 — Multi-tenancy, Import, Catalogue, Polish

This is the biggest, highest-risk step in the build so far. It restructures the data model (multi-tenancy), introduces a brand-new pipeline (Mechanic Desk CSV import), adds two new screens (parts catalogue + suppliers), applies wife-feedback fixes, AND rebrands the product to Shopbook.

Because the multi-tenancy change touches every table and rewrites RLS, **this step is destructive if done wrong**. Take it carefully. Block order has been chosen so that the riskiest, most-rollback-needed work happens first while the database is still fresh, and reversible cosmetic work happens last.

## Mode and model

Use **Claude Opus 4.7** in **auto mode** for this entire session. The work is long-running and includes file creation, migrations, bash commands, and Supabase MCP calls. Auto mode handles the permission flow.

If you're not already in auto mode when this prompt is read, the user will switch you. Don't ask permission for routine operations.

## Plan and proceed

Show me a concise plan first. The plan must address:

1. The block order (do I agree with the proposed order below)
2. The migration numbering (verify what number to start from by listing existing migrations)
3. How you'll handle the RLS recursion problem (see Block C2 below — this is the biggest technical trap)
4. Your rollback strategy if Block C goes wrong
5. Any judgement calls

Then proceed end-to-end without further checkpoints. Commit after each block.

## Block order (reorganised from prior draft)

```
A. Pre-flight safety checks         ← NEW — do not skip
B. Mechanic Desk import schema      ← non-destructive (new tables only)
C. Multi-tenancy                    ← destructive — happens with fresh state
D. Mechanic Desk import pipeline    ← code, depends on B + C
E. Parts catalogue UI               ← code, depends on D
F. Wife feedback fixes              ← cosmetic, low risk
G. Brand swap to Shopbook           ← cosmetic, last so it doesn't get rolled back
H. Verification + push
```

The change vs my earlier draft: brand swap goes LAST, not first. If anything earlier needs rollback, the brand swap isn't lost. Multi-tenancy happens BEFORE the import pipeline so the import knows about org_id from day one.

---

## Block A — Pre-flight safety checks

Before any migrations:

### A1. Inventory current migrations

```bash
ls supabase/migrations/
```

Tell me what's there. Step 2.5 produced 0008–0011 (with 0006–0007 skipped per the existing build log). Confirm the next free migration number. If 0012 is taken, increment.

### A2. Confirm Supabase project state matches expectations

Via MCP:
```sql
select count(*) from jobs;
select count(*) from customers;
select count(*) from app_users;
select id, role from app_users;
```

Expected: 10 jobs (the 8 seeded + Cath + Stella), customers 8-ish, 1 controller user. If significantly different, stop and tell me.

### A3. Take a logical snapshot of the current state

Via MCP, run:
```sql
-- Save current schema state for reference / rollback understanding
select tablename from pg_tables where schemaname = 'public' order by tablename;
select policyname, tablename from pg_policies where schemaname = 'public' order by tablename, policyname;
```

Save these into a markdown file `docs/step3-pre-snapshot.md` so we have a record of what existed before changes.

### A4. Print the current `auth.uid()` → user → role flow

Look at the existing RLS policies on `jobs`, `customers`, etc. Document the EXACT current pattern in `docs/step3-pre-snapshot.md`. This matters because in Block C you'll be replacing these policies and we need to know the shape of what's being replaced.

### A5. Tell user to take a Supabase DB snapshot

Add an explicit instruction (write it as a TODO in the docs file): the user should manually take a Supabase point-in-time snapshot from the Supabase dashboard BEFORE the multi-tenancy migration runs. Print this notice prominently in the plan.

Don't run Block C until I confirm I've taken a snapshot.

**This is the one place we WILL wait for me to confirm**, despite "no checkpoints." The reason: multi-tenancy is destructive to the schema. Snapshot first.

---

## Block B — Mechanic Desk import schema (non-destructive new tables)

Apply this BEFORE multi-tenancy because:
- These are new tables (no risk to existing data)
- We can write the schema without `organisation_id` first, then add it in Block C alongside everything else
- Lets us spot issues in the import-table design before they get tangled with the tenancy refactor

### B1. Create the schema

Migration `<next_number>_import_schema.sql`:

```sql
-- All tables get organisation_id added in the NEXT migration (Block C).
-- For now, create the structure cleanly.

create table if not exists import_batches (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz default now(),
  status text not null default 'pending',
  error_message text,
  files_uploaded text[],
  stats jsonb,
  rows_inserted integer default 0,
  rows_updated integer default 0,
  rows_failed integer default 0,
  completed_at timestamptz
);

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_email text,
  contact_phone text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists stock_items (
  id uuid primary key default gen_random_uuid(),
  external_id text,
  stock_number text not null,
  name text not null,
  description text,
  category text,
  brand text,
  model text,
  buy_price numeric,
  sell_price numeric,
  markup_percentage numeric,
  taxable boolean default true,
  quantity numeric default 0,
  allocated numeric default 0,
  available numeric default 0,
  ordered numeric default 0,
  unit_of_measure text default 'EA',
  bin_location text,
  last_sales_date date,
  last_purchase_date date,
  is_non_stock boolean default false,
  deactivated boolean default false,
  tags text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Uniqueness will be (organisation_id, stock_number) after Block C
-- For now, just stock_number — will recreate constraint after org_id is added

create table if not exists stock_item_suppliers (
  stock_item_id uuid references stock_items(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete cascade,
  supplier_stock_number text,
  is_primary boolean default false,
  primary key (stock_item_id, supplier_id)
);

create table if not exists historical_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null,
  customer_external_id text,
  customer_name text,
  customer_email text,
  customer_phone text,
  vehicle_external_id text,
  vehicle_make text,
  vehicle_model text,
  vehicle_registration text,
  job_number text,
  job_status text,
  job_start_date timestamptz,
  job_end_date timestamptz,
  first_job_type text,
  description text,
  issue_date date,
  due_date date,
  net_amount numeric,
  tax_amount numeric,
  total_amount numeric,
  total_cost numeric,
  paid_amount numeric,
  amount_due numeric,
  comments text,
  internal_notes text,
  mechanics text,
  created_at_external timestamptz,
  imported_at timestamptz default now(),
  import_batch_id uuid references import_batches(id)
);

create table if not exists historical_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references historical_invoices(id) on delete cascade,
  invoice_number text not null,
  description text,
  category text,
  details text,
  unit_price numeric,
  quantity numeric,
  discount_percentage numeric,
  net_amount numeric,
  tax_amount numeric,
  total_amount numeric,
  taxable boolean,
  stock_number text,
  stock_name text,
  stock_category text,
  unit_cost numeric,
  cogs numeric,
  salesperson text,
  created_at_external timestamptz,
  imported_at timestamptz default now()
);

create table if not exists historical_quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number text not null,
  description text,
  customer_external_id text,
  customer_name text,
  customer_email text,
  customer_phone text,
  vehicle_make text,
  vehicle_model text,
  vehicle_year text,
  issue_date date,
  net_amount numeric,
  gst_amount numeric,
  total_amount numeric,
  status text,
  assessed_by text,
  estimated_by text,
  comments text,
  imported_at timestamptz default now(),
  import_batch_id uuid references import_batches(id)
);

create table if not exists historical_quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid references historical_quotes(id) on delete cascade,
  quote_number text not null,
  description text,
  category text,
  unit_price numeric,
  quantity numeric,
  net_amount numeric,
  tax_amount numeric,
  total_amount numeric,
  taxable boolean,
  stock_number text,
  stock_name text,
  stock_category text,
  unit_cost numeric,
  imported_at timestamptz default now()
);

-- RLS is enabled but no policies yet — they get added in Block C with org-scoping
alter table import_batches enable row level security;
alter table suppliers enable row level security;
alter table stock_items enable row level security;
alter table stock_item_suppliers enable row level security;
alter table historical_invoices enable row level security;
alter table historical_invoice_items enable row level security;
alter table historical_quotes enable row level security;
alter table historical_quote_items enable row level security;

-- No-access policies as a default — Block C replaces these
create policy "no access pre tenancy" on import_batches for all using (false);
create policy "no access pre tenancy" on suppliers for all using (false);
create policy "no access pre tenancy" on stock_items for all using (false);
create policy "no access pre tenancy" on stock_item_suppliers for all using (false);
create policy "no access pre tenancy" on historical_invoices for all using (false);
create policy "no access pre tenancy" on historical_invoice_items for all using (false);
create policy "no access pre tenancy" on historical_quotes for all using (false);
create policy "no access pre tenancy" on historical_quote_items for all using (false);
```

### B2. Commit

`Step 3b: Mechanic Desk import schema (tables, RLS placeholders)`

---

## Block C — Multi-tenancy (DESTRUCTIVE — proceed only after snapshot confirmed)

**STOP HERE.** Print a clear message to the user:

> ⚠ MULTI-TENANCY MIGRATION ABOUT TO RUN. This restructures the schema and rewrites RLS. Please confirm you have taken a Supabase point-in-time snapshot before proceeding. Reply 'snapshot taken' to continue.

Wait for the user's confirmation. Do NOT proceed until they say it. This is the one legitimate wait-point.

### C1. Schema migration `<next_number>_multi_tenancy.sql`

```sql
-- 1. Create the top-level organisations table
create table organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  trading_name text,
  abn text,
  address text,
  phone text,
  email text,
  logo_url text,
  brand_primary_color text,
  is_platform_owner boolean default false,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Seed the two foundational orgs
insert into organisations (id, name, slug, trading_name, abn, is_platform_owner) values
  ('00000000-0000-0000-0000-000000000001', 'TeamRoll', 'teamroll', 'TeamRoll Pty Ltd', null, true),
  ('00000000-0000-0000-0000-000000000002', 'Carafix', 'carafix', 'Carafix Caravan Repairs', '66663914154', false);

-- 3. Add organisation_id to every business table.
-- IMPORTANT: enumerate every business table explicitly. Use the snapshot from A4
-- to confirm you've covered all of them. Include both the original Step 1/2 tables
-- AND the Block B import tables.

-- Existing business tables (verify against snapshot):
alter table locations add column organisation_id uuid references organisations(id);
alter table customers add column organisation_id uuid references organisations(id);
alter table vans add column organisation_id uuid references organisations(id);
alter table technicians add column organisation_id uuid references organisations(id);
alter table jobs add column organisation_id uuid references organisations(id);
alter table tasks add column organisation_id uuid references organisations(id);
alter table parts add column organisation_id uuid references organisations(id);
alter table bays add column organisation_id uuid references organisations(id);
alter table holidays add column organisation_id uuid references organisations(id);
alter table job_attachments add column organisation_id uuid references organisations(id);
alter table job_status_log add column organisation_id uuid references organisations(id);
alter table promise_date_log add column organisation_id uuid references organisations(id);
alter table ai_briefings add column organisation_id uuid references organisations(id);
alter table app_users add column organisation_id uuid references organisations(id);

-- Block B's new tables also need org_id
alter table import_batches add column organisation_id uuid references organisations(id);
alter table suppliers add column organisation_id uuid references organisations(id);
alter table stock_items add column organisation_id uuid references organisations(id);
alter table historical_invoices add column organisation_id uuid references organisations(id);
alter table historical_invoice_items add column organisation_id uuid references organisations(id);
alter table historical_quotes add column organisation_id uuid references organisations(id);
alter table historical_quote_items add column organisation_id uuid references organisations(id);

-- 4. Backfill ALL existing rows to Carafix org
update locations set organisation_id = '00000000-0000-0000-0000-000000000002';
update customers set organisation_id = '00000000-0000-0000-0000-000000000002';
update vans set organisation_id = '00000000-0000-0000-0000-000000000002';
update technicians set organisation_id = '00000000-0000-0000-0000-000000000002';
update jobs set organisation_id = '00000000-0000-0000-0000-000000000002';
update tasks set organisation_id = '00000000-0000-0000-0000-000000000002';
update parts set organisation_id = '00000000-0000-0000-0000-000000000002';
update bays set organisation_id = '00000000-0000-0000-0000-000000000002';
update holidays set organisation_id = '00000000-0000-0000-0000-000000000002';
update job_attachments set organisation_id = '00000000-0000-0000-0000-000000000002';
update job_status_log set organisation_id = '00000000-0000-0000-0000-000000000002';
update promise_date_log set organisation_id = '00000000-0000-0000-0000-000000000002';
update ai_briefings set organisation_id = '00000000-0000-0000-0000-000000000002';
update app_users set organisation_id = '00000000-0000-0000-0000-000000000002';

-- 5. NOT NULL on all of them (only after backfill confirmed)
alter table locations alter column organisation_id set not null;
alter table customers alter column organisation_id set not null;
alter table vans alter column organisation_id set not null;
alter table technicians alter column organisation_id set not null;
alter table jobs alter column organisation_id set not null;
alter table tasks alter column organisation_id set not null;
alter table parts alter column organisation_id set not null;
alter table bays alter column organisation_id set not null;
alter table holidays alter column organisation_id set not null;
alter table job_attachments alter column organisation_id set not null;
alter table job_status_log alter column organisation_id set not null;
alter table promise_date_log alter column organisation_id set not null;
alter table ai_briefings alter column organisation_id set not null;
alter table app_users alter column organisation_id set not null;
alter table import_batches alter column organisation_id set not null;
alter table suppliers alter column organisation_id set not null;
alter table stock_items alter column organisation_id set not null;
alter table historical_invoices alter column organisation_id set not null;
alter table historical_invoice_items alter column organisation_id set not null;
alter table historical_quotes alter column organisation_id set not null;
alter table historical_quote_items alter column organisation_id set not null;

-- 6. Recreate uniqueness constraints to include org_id
alter table stock_items add constraint stock_items_org_stock_unique unique (organisation_id, stock_number);
alter table suppliers add constraint suppliers_org_name_unique unique (organisation_id, name);
alter table historical_invoices add constraint hist_invoices_org_number_unique unique (organisation_id, invoice_number);
alter table historical_quotes add constraint hist_quotes_org_number_unique unique (organisation_id, quote_number);

-- 7. Indexes for the most common lookups
create index idx_jobs_org_location on jobs(organisation_id, location_id);
create index idx_customers_org on customers(organisation_id);
create index idx_vans_org on vans(organisation_id);
create index idx_technicians_org on technicians(organisation_id);
create index idx_stock_org_category on stock_items(organisation_id, category);
create index idx_stock_org_last_sales on stock_items(organisation_id, last_sales_date desc);
create index idx_hist_invoices_org_date on historical_invoices(organisation_id, issue_date desc);
create index idx_hist_invoices_vehicle on historical_invoices(organisation_id, vehicle_make, vehicle_model);
```

### C2. RLS helper function — AVOID THE RECURSION TRAP

Here's the issue: if `current_user_org_id()` does `SELECT organisation_id FROM app_users WHERE id = auth.uid()`, AND `app_users` has its own RLS policy that calls `current_user_org_id()`, you get infinite recursion. This will break login.

**Solution: mark the function `SECURITY DEFINER` so it bypasses RLS on `app_users` when executing.**

```sql
create or replace function current_user_org_id()
returns uuid
language sql
security definer  -- This bypasses RLS on app_users when the function runs
set search_path = public, auth
stable
as $$
  select organisation_id from public.app_users where id = auth.uid()
$$;

-- Grant execute to authenticated users
grant execute on function current_user_org_id() to authenticated;
```

Also: write a SEPARATE policy for `app_users` itself that doesn't recurse:

```sql
-- app_users gets a self-referential policy that doesn't use the helper function
drop policy if exists "users see own profile" on app_users;
create policy "users see own profile" on app_users
  for select using (id = auth.uid());

-- A separate policy for org admins to see other users in their org (no recursion)
create policy "org admins see users in their org" on app_users
  for select using (
    organisation_id in (
      select organisation_id from public.app_users where id = auth.uid()
    )
  );
```

### C3. Drop ALL existing policies, then recreate with org-scoping

This is critical. The Step 1+2+2.5 policies filter by location_id and role. They MUST be dropped before we apply org-scoped versions, otherwise the policies coexist and create AND-logic confusion.

For EVERY business table, do this pattern:

```sql
-- Example for jobs:
-- 1. List existing policies
-- 2. Drop them all
-- 3. Create new org-scoped versions

drop policy if exists "controllers can see jobs in their location" on jobs;
drop policy if exists "controllers can edit jobs in their location" on jobs;
-- (drop any other existing policies on jobs — enumerate from the snapshot)

create policy "users see jobs in their org" on jobs
  for select using (organisation_id = current_user_org_id());
create policy "users insert jobs in their org" on jobs
  for insert with check (organisation_id = current_user_org_id());
create policy "users update jobs in their org" on jobs
  for update using (organisation_id = current_user_org_id())
                with check (organisation_id = current_user_org_id());
create policy "users delete jobs in their org" on jobs
  for delete using (organisation_id = current_user_org_id());
```

Apply this pattern to: locations, customers, vans, technicians, jobs, tasks, parts, bays, holidays, job_attachments, job_status_log, promise_date_log, ai_briefings, import_batches, suppliers, stock_items, stock_item_suppliers, historical_invoices, historical_invoice_items, historical_quotes, historical_quote_items.

For `stock_item_suppliers` (no org_id column directly), use a join:

```sql
create policy "users see stock_item_suppliers in their org" on stock_item_suppliers
  for select using (
    stock_item_id in (select id from stock_items where organisation_id = current_user_org_id())
  );
```

### C4. Update views

If `v_job_rollup` exists, it needs to be SECURITY INVOKER (default) so RLS applies. Re-run any view definitions to make sure they pick up new columns.

### C5. Update LocationContext to be org-aware

Update `src/contexts/LocationContext.tsx` (or wherever):
- On mount, query `app_users` for current user's `organisation_id` AND `default_location_id`
- Load `locations` filtered by that org (RLS will enforce, but query explicitly anyway)
- Default to `default_location_id` if set, otherwise first location

No UI change to the switcher — it still toggles between Arundel/Currumbin for the Carafix user. But it's now org-aware under the hood.

### C6. Test tenant isolation BEFORE proceeding

Run these checks via MCP:

```sql
-- 1. The controller user has org_id = Carafix
select id, email, organisation_id, role from app_users;

-- 2. All jobs are scoped to Carafix
select organisation_id, count(*) from jobs group by 1;

-- 3. The helper function works
select current_user_org_id();
-- This should return 00000000-0000-0000-0000-000000000002 when called as authenticated

-- 4. RLS is enabled on every business table
select tablename, rowsecurity from pg_tables 
where schemaname = 'public' 
and tablename in ('jobs', 'customers', 'vans', 'technicians', 'parts', 
                  'stock_items', 'suppliers', 'historical_invoices')
order by tablename;
-- All should have rowsecurity = true

-- 5. Policies are in place
select tablename, count(*) as policy_count 
from pg_policies 
where schemaname = 'public' 
group by tablename 
order by tablename;
-- Every business table should have 4 policies (select, insert, update, delete) or 1 (for all)
```

Print these results in your output. If anything looks wrong, STOP and tell me.

### C7. Commit

`Step 3c: multi-tenancy schema, RLS rewrite, LocationContext org-aware`

---

## Block D — Mechanic Desk import pipeline (code)

### D1. Parser implementation

Create `src/lib/import/mechanic-desk.ts`. One parser function per CSV type. Each:

```typescript
type ParsedRow<T> = { row: T; lineNumber: number };
type ParseError = { lineNumber: number; field?: string; message: string; rawValue?: string };
type ParseResult<T> = { rows: ParsedRow<T>[]; errors: ParseError[] };

function parseCustomers(csv: string): ParseResult<CustomerRow> { ... }
function parseStocks(csv: string): ParseResult<StockRow> { ... }
function parseInvoicesSummary(csv: string): ParseResult<InvoiceRow> { ... }
function parseInvoiceItems(csv: string): ParseResult<InvoiceItemRow> { ... }
function parseQuotes(csv: string): ParseResult<QuoteRow> { ... }
function parseQuoteItems(csv: string): ParseResult<QuoteItemRow> { ... }
```

**Parsing rules (CRITICAL — these are from real Mechanic Desk data):**

- Date format: `DD/MM/YYYY` for dates, `DD/MM/YYYY HH:mm` for timestamps. Parse with `date-fns/parse`. Reject invalid dates with a ParseError, don't insert nulls silently.
- Numeric fields with empty string `""` → `null`. With value `"0"` → `0`. NEVER coerce empty to 0.
- Numeric fields can be **negative** (e.g. `Quantity: -462.98` exists in real data — refunds/adjustments). Don't reject negatives; they're real.
- Boolean fields: `"Y"` → `true`, `"N"` → `false`, `""` → `null` (not false, because absence isn't the same as "no").
- Empty stock_number/name in Stocks.csv → skip the row, log an error (a stock item without a name is unusable).
- Suppliers field in Stocks.csv is semicolon-separated. Split on `;`, trim, dedupe empty strings.
- Stock items where `stock_number == 'PART'` (the generic Mechanic Desk placeholder) → import them but flag `is_non_stock = true`. They're free-text line items, not real SKUs.
- Customer/vehicle data on invoices is intentionally denormalised — store as-is, don't try to join back to `customers` at import time.

Use the `papaparse` library for CSV parsing — handles quoted fields with embedded commas, newlines in quoted text (which the data has).

### D2. Server action `src/app/actions/import.ts`

```typescript
async function importMechanicDeskZip(zipFile: File, organisationId: string) {
  // 1. Create import_batches row, status='processing'
  // 2. Unzip in memory (use jszip library)
  // 3. For each known CSV inside:
  //    a. Parse it
  //    b. Insert in batches of 500 rows via Supabase
  //    c. Use upsert with conflict on (organisation_id, external_id_or_natural_key)
  //    d. Track inserted vs updated vs failed
  // 4. After all files: update batch status='completed', write stats jsonb
  // 5. On any unrecoverable error: status='failed', error_message set
}
```

Use Supabase's `.upsert()` with `onConflict` option:

```typescript
await supabase
  .from('stock_items')
  .upsert(rows, { 
    onConflict: 'organisation_id,stock_number',
    ignoreDuplicates: false  // we want updates
  });
```

### D3. Import UI at `/imports`

New route. Page layout:

- Top: drag-and-drop zone for `.zip` files
- Middle: progress indicator while processing (use server actions with revalidation, or a status-poll pattern)
- Bottom: table of past `import_batches` with status, files, rows-inserted, rows-updated, rows-failed, uploaded_at

Add "Imports" to the nav under Settings (or as a top-level item — your call, but lean toward Settings → Imports for cleanliness).

### D4. Idempotency requirement

The user will likely run the same ZIP through more than once during testing. Re-import must:
- Update existing rows (matched by `external_id` for customers/stock, `invoice_number` for invoices, `quote_number` for quotes)
- Not duplicate
- Increment `rows_updated` counter, not `rows_inserted`

Test this explicitly in D6.

### D5. Customer import strategy

Mechanic Desk has 3,504 customers. Carafix currently has ~8 demo customers. Strategy:

- Match on `customer_external_id` (the Mechanic Desk UUID) stored on `customers.external_id` (add this column if it doesn't exist via the migration in this block)
- If a MD customer has the same email/phone as an existing Carafix demo customer, prefer the MD record (update demo)
- New MD customers get inserted fresh
- The current demo customers (Whitlam, Fitzgerald, etc.) might or might not be in MD — that's fine, they'll coexist

Add this small migration alongside the importer:

```sql
-- Migration: <next>_add_external_id_to_customers.sql
alter table customers add column if not exists external_id text;
create unique index if not exists idx_customers_org_external_id 
  on customers(organisation_id, external_id) 
  where external_id is not null;
```

### D6. Self-test with the sample ZIPs

The user has 5 sample ZIPs in `sample-imports/` (or wherever — ask the user where they put them if you can't find them):

- `export-15186-26_05_2026-22-05.zip` (Stocks)
- `export-15186-26_05_2026-22-05__1_.zip` (Quotes + Quote Items)
- `export-15186-26_05_2026-22-07.zip` (Invoices Summary + Invoice Items + Payment + Credit Notes)
- `export-15186-26_05_2026-22-07__1_.zip` (Stocks — dup)
- `export-15186-26_05_2026-22-07__2_.zip` (Customers + Customer Contacts)

Process:
1. After build is green, do a curl/script test of the importer against these ZIPs
2. Don't use the UI yet — call the server action directly in a test script
3. Expected outcomes:
   - ~3,504 customers
   - ~5,354 stock items (after deduplicating across the 2 stock ZIPs)
   - ~183 unique suppliers
   - ~45 historical invoices + 155 line items
   - ~2 historical quotes + 12 line items
4. Run it TWICE in a row to verify idempotency — second run should show all-updates, no-inserts
5. Document the results in the final summary

If the self-test fails or numbers are way off, fix the parser, don't paper over. Numbers can be slightly off (±2%) due to malformed rows in real data — that's fine. ±20% means something's wrong.

### D7. Commit

`Step 3d: Mechanic Desk import pipeline, parsers, import UI, self-tested`

---

## Block E — Parts catalogue + suppliers UI

### E1. Restructure /parts as tabbed section

Current `/parts` shows outstanding parts for current jobs. Restructure:

- `/parts` → "Parts on order" (rename in nav too — was just "Parts")
- `/parts/catalogue` → "Catalogue" (new)
- `/parts/suppliers` → "Suppliers" (new)

Add a tab strip at the top of the Parts section. Active tab highlighted. Tabs are simple internal links, not client-side state — each page loads independently.

### E2. /parts/catalogue

Table view of `stock_items`:

| Stock # | Name | Category | Brand | Sell | Buy | Margin % | Available | Last Sold |
|---|---|---|---|---|---|---|---|---|

- Search box top-right (fuzzy match on stock_number, name, brand using `ilike '%query%'`)
- Filters: Category (dropdown of distinct categories), "Has Stock" toggle (available > 0), "Sold in last 12 months" toggle
- Sort: by Last Sold DESC by default (most-used parts surface first)
- Pagination: 50 rows per page, server-side
- Row click → drawer slides in from right with full detail (description, all prices, suppliers, "Used in jobs" count via a `count(*) from historical_invoice_items where stock_number = X`)
- "Loading..." skeleton during fetch
- Empty state: "No parts in catalogue yet. Import from Mechanic Desk in Settings → Imports."

### E3. /parts/suppliers

Simpler table:

| Supplier | # Items | Avg Markup | Last Order |
|---|---|---|---|

- "# Items" = count from `stock_item_suppliers`
- "Avg Markup" = average `markup_percentage` of stock items they supply
- "Last Order" = max `last_purchase_date` across stock items they supply
- Row click → list of all stock items from that supplier (use the catalogue table component with a pre-applied filter)

### E4. Read-only in v1

No edit forms. Data flows in via import. The catalogue is a window into the imported data, not an editor.

### E5. Commit

`Step 3e: parts catalogue + suppliers screens`

---

## Block F — Wife feedback fixes

### F1. Rename "Ending today" → "Expected completion today"

Single string in the dashboard. Search for "Ending today" and replace.

### F2. Dashboard count strip fix

Current strip overlaps and confuses. Change to:

```
[6 Active] [2 In progress] [1 On hold] [2 Urgent ⚠] [1 Delayed ⚠]
            "of 6 active"   "of 6 active"  "(may overlap)" "(may overlap)"
```

- **Active** = status not in ('Picked Up')
- **In progress** = status = 'In Progress'
- **On hold** = status = 'On Hold' (replaces "Parts waiting" which was wrong terminology — "Parts waiting" isn't a status, it's a sub-reason)
- **Urgent** = is_urgent flag (subset of active, may overlap with In Progress or On Hold)
- **Delayed** = is_delayed flag (subset of active, may overlap)

Add a small text caption below the strip in muted grey:

> Urgent and Delayed are flags — they overlap with status counts.

Each tile remains clickable, links to Jobs page with the relevant filter.

### F3. "View all 6 →" link fix

Two-part fix:

**Part A**: Update the link text to drop the count. Just say "View all →".

**Part B**: Make the Jobs page understand URL filter params. Add support for these query params on `/jobs`:

- `?filter=customer_collecting` → show only jobs where customer_promised_date is set and status not in ('Picked Up'), sorted by customer_promised_date ASC
- `?filter=in_progress` → status in ('Arrived', 'In Progress', 'On Hold')
- `?filter=urgent` → is_urgent = true
- `?filter=delayed` → is_delayed = true
- `?filter=on_hold` → status = 'On Hold'

The "View all →" link in each dashboard widget should set the appropriate filter param. When a filter is active, show a chip at the top of the Jobs list ("Filter: Customer collecting · clear") so the user knows.

### F4. "In Progress today" caption

Add caption text under the widget title:

> "Jobs in the workshop right now — Arrived, In Progress, or On Hold."

And update the widget query to include those three statuses (not just In Progress).

### F5. Commit

`Step 3f: wife feedback — labels, dashboard count fix, filter params`

---

## Block G — Brand swap to Shopbook (LAST — cosmetic, low risk)

### G1. Create `src/lib/brand.ts`

```typescript
export const BRAND = {
  name: "Shopbook",
  tagline: "The workshop's brain",
  domain: "shopbook.ai",
  supportEmail: "hello@shopbook.ai",
  productDescription: "AI-powered workshop operations platform",
} as const;
```

### G2. Replace platform brand references

Find every occurrence of "Carafix Workshop" in the codebase and replace with `{BRAND.name}` or `BRAND.name` (depending on JSX vs TS context).

Distinguish carefully:
- "Carafix Workshop" as platform/product name → REPLACE with `BRAND.name`
- "Carafix" as a customer/tenant name (e.g. in seed data, on the org switcher when we add it) → LEAVE ALONE

Files to update (audit broadly, but at least these):
- `src/app/layout.tsx` (page title, metadata)
- `src/app/(auth)/login/page.tsx` (login heading)
- Top navigation header component
- README.md
- `package.json` `name` field — change to "shopbook" (lowercase, no spaces)
- Any email signatures or PDF footers (if they exist)

### G3. Placeholder wordmark

Create `public/brand/wordmark.svg` — a simple text-based SVG saying "Shopbook" in a clean font (use Inter or system-ui via SVG text element). No fancy design; just a placeholder.

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="160" height="32" viewBox="0 0 160 32">
  <text x="0" y="22" font-family="Inter, system-ui, sans-serif" font-size="22" font-weight="700" fill="currentColor">Shopbook</text>
</svg>
```

Use it in the top nav. The component should render it inline so `currentColor` works (the brand text picks up text colour from CSS).

### G4. README rebrand instructions

Add a section to README.md:

```markdown
## Rebranding the platform

The platform name is centralised in one file. To rebrand:

1. Edit `src/lib/brand.ts` — change `name`, `tagline`, `domain`, `supportEmail`
2. Replace `public/brand/wordmark.svg` with your new logo (keep dimensions ~160x32)
3. Update `package.json` `name` field
4. Run `npm run build` to verify
5. (Optional) Rename the repo on GitHub via Settings → Rename
6. (Optional) Update environment variables, deployment configs

No code changes required outside these files. The repo name on disk stays as-is.
```

### G5. Repo rename decision

DO NOT rename the GitHub repo. The directory is `carafix-workshop`, the GitHub URL is `ryanhanly-prog/carafix-workshop`. Renaming would break:
- Existing git remotes
- Vercel deployments (if any)
- Bookmarks and shared links

Leave the repo named `carafix-workshop`. Document in the README that "the repo predates the Shopbook brand — repo name doesn't matter, the product brand is set via `brand.ts`."

### G6. Commit

`Step 3g: Shopbook brand abstraction via centralised config`

---

## Block H — Verification + push

### H1. `npm run build`

Must succeed. If not, fix. Common breakage sources after multi-tenancy:
- Server actions that don't pass org_id when inserting
- TypeScript types out of sync with new schema (regenerate via `npx supabase gen types typescript`)
- Component prop types changed

### H2. Regenerate database types

```bash
npx supabase gen types typescript --project-id uckshjquyupolwwglacm > src/lib/database.types.ts
```

### H3. Smoke test via Supabase MCP

```sql
-- 1. Multi-tenancy intact
select organisation_id, count(*) from jobs group by 1;
-- Should be ONE row, org_id = Carafix, count = 10

select count(*) from organisations;
-- Should be 2 (TeamRoll, Carafix)

-- 2. Import worked
select count(*) from stock_items;       -- ~5354
select count(*) from suppliers;         -- ~183
select count(*) from customers;         -- ~3504 (sum of MD + demo)
select count(*) from historical_invoices; -- ~45
select count(*) from historical_quotes;   -- ~2

-- 3. RLS in place
select tablename, count(*) policy_count from pg_policies 
where schemaname = 'public' group by tablename order by tablename;

-- 4. No orphaned rows
select count(*) from jobs where organisation_id is null;   -- 0
select count(*) from stock_items where organisation_id is null; -- 0
```

Print these results in the final summary.

### H4. Commits and push

Verify all 6 commits are present:
- Step 3a: ... pre-flight (you might not have committed A — that's fine, it was investigative)
- Step 3b: import schema
- Step 3c: multi-tenancy
- Step 3d: import pipeline
- Step 3e: parts catalogue
- Step 3f: wife feedback fixes
- Step 3g: brand swap

Then:
```bash
git push origin main
```

Note: the safety classifier may block direct push to main (as it did in Step 2.5). If so, leave the commits queued locally and tell me to run `git push origin main` manually.

### H5. Final summary

In `docs/step3-summary.md`, document:

1. Final route map (every URL, what it shows)
2. Migrations applied (numbers + descriptions)
3. Tables that now exist (output of `\dt`)
4. Test import row counts (actual vs expected)
5. RLS policy count per table
6. Any TODO comments left in the code
7. Judgement calls made and why
8. Suggested Step 4 scope

Also print this summary to the chat.

---

## What's out of scope

- AI-assisted quoting (Step 4)
- Quote authoring UI (Step 4)
- Photo uploads (later)
- Mobile tech view (later)
- Schedule grid (later)
- Mid-flight quote editing (later)
- Per-tenant theming beyond platform brand (later)
- Multi-org users / org switcher UI (later)
- Org admin / platform admin role distinction (later)
- Full historical Mechanic Desk export (user will run this separately, then we re-import via the same UI)

## Critical reminders

1. **Block C is destructive.** Wait for snapshot confirmation before running.
2. **The RLS helper function MUST be SECURITY DEFINER** or login breaks via infinite recursion on app_users.
3. **Drop existing RLS policies explicitly** before creating new ones. Don't assume they'll be replaced.
4. **CSV parsing has edge cases** — negative numbers are real, empty strings are NOT zero, dates are DD/MM/YYYY, suppliers are semicolon-separated.
5. **Import must be idempotent.** Re-running same ZIP doesn't duplicate; it updates via `external_id` upsert.
6. **Brand swap is LAST** so it doesn't get lost if anything earlier needs rollback.
7. **Repo name stays `carafix-workshop`** — don't rename.

Show the plan. Wait for my "proceed". For Block C, wait for "snapshot taken". Otherwise run straight through in auto mode.
