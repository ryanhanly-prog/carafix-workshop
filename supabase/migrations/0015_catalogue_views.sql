-- Step 3e: read-only support views for the parts catalogue + suppliers screens.
-- Both are security_invoker so they respect the caller's org-scoped RLS through
-- the underlying tables.

-- Per-supplier rollup for the Suppliers screen.
create view v_supplier_rollup
with (security_invoker = true) as
select
  s.id           as supplier_id,
  s.organisation_id,
  s.name,
  count(distinct sis.stock_item_id) as item_count,
  avg(si.markup_percentage)         as avg_markup,
  max(si.last_purchase_date)        as last_order_date
from suppliers s
left join stock_item_suppliers sis on sis.supplier_id = s.id
left join stock_items si on si.id = sis.stock_item_id
group by s.id, s.organisation_id, s.name;

-- Distinct categories for the catalogue category filter (cheap to query vs.
-- pulling every stock row client-side).
create view v_stock_categories
with (security_invoker = true) as
select distinct organisation_id, category
from stock_items
where category is not null and category <> '';
