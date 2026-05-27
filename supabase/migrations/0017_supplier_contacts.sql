-- Step 3.5a: supplier contact details, so parts can be ordered straight from the
-- Suppliers screen.
--
-- Note: 0012 created suppliers with vestigial contact_email/contact_phone columns
-- that were never populated (the importer only ever wrote name). They are dropped
-- here in favour of the clearer phone/email naming below — verified empty
-- (0 of 181 rows) before dropping, and referenced nowhere but the generated types.

alter table suppliers drop column if exists contact_phone;
alter table suppliers drop column if exists contact_email;

alter table suppliers add column if not exists phone text;
alter table suppliers add column if not exists email text;
alter table suppliers add column if not exists website text;
alter table suppliers add column if not exists account_number text;      -- our account # with this supplier
alter table suppliers add column if not exists primary_contact_name text;
alter table suppliers add column if not exists address text;
alter table suppliers add column if not exists payment_terms text;       -- "Net 30", "COD", "2/10 Net 30"
alter table suppliers add column if not exists notes text;               -- already exists from 0012; no-op
alter table suppliers add column if not exists updated_at timestamptz default now();

-- updated_at maintenance trigger. search_path is pinned to keep the security
-- linter happy (matches the convention of the other trigger functions).
create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists trg_suppliers_updated_at on suppliers;
create trigger trg_suppliers_updated_at
  before update on suppliers
  for each row execute function set_updated_at();
