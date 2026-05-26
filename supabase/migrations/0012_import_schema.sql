-- Step 3b: Mechanic Desk import schema.
--
-- Applied BEFORE multi-tenancy (Block C) on purpose: these are brand-new tables
-- with no existing data, so creating them is non-destructive. organisation_id is
-- deliberately omitted here and added in 0013_multi_tenancy.sql alongside every
-- other table, so the tenancy refactor happens in one coherent migration.
--
-- RLS is enabled now but only with deny-all placeholder policies; 0013 replaces
-- them with org-scoped policies. This guarantees the tables are never readable
-- in the window between this migration and the tenancy one.

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

-- Uniqueness becomes (organisation_id, stock_number) in 0013. For now there is
-- no unique constraint on stock_number alone, because the raw Mechanic Desk data
-- contains repeated 'PART' placeholder rows that would otherwise collide.

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

-- RLS on; deny-all placeholders until 0013 swaps in org-scoped policies.
alter table import_batches enable row level security;
alter table suppliers enable row level security;
alter table stock_items enable row level security;
alter table stock_item_suppliers enable row level security;
alter table historical_invoices enable row level security;
alter table historical_invoice_items enable row level security;
alter table historical_quotes enable row level security;
alter table historical_quote_items enable row level security;

create policy "no access pre tenancy" on import_batches for all using (false);
create policy "no access pre tenancy" on suppliers for all using (false);
create policy "no access pre tenancy" on stock_items for all using (false);
create policy "no access pre tenancy" on stock_item_suppliers for all using (false);
create policy "no access pre tenancy" on historical_invoices for all using (false);
create policy "no access pre tenancy" on historical_invoice_items for all using (false);
create policy "no access pre tenancy" on historical_quotes for all using (false);
create policy "no access pre tenancy" on historical_quote_items for all using (false);
