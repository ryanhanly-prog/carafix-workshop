-- 0029 — sku_price_stats: precomputed per-org per-SKU pricing norms
--
-- Source of truth: historical_invoice_items (transacted reality, ~30,720
-- SKU'd rows over 3 years for Carafix). Read by get_quote_anchors() in
-- migration 0030 to surface "your typical price" inline on quote lines.
--
-- Refresh model (v1): manual, via refresh_sku_price_stats(p_org). Called once
-- at the end of this migration so the table is populated on landing. Live
-- editing of quotes does NOT write here — quotes-as-source is a deliberate
-- future flywheel (post-invoicing) and out of scope for 4c.
--
-- Why precomputed: anchor lookup is a per-keystroke surface; aggregating
-- 30k+ rows on every quote load is not viable. PK lookup on this table is.

create table if not exists sku_price_stats (
  organisation_id    uuid not null references organisations(id) on delete cascade,
  stock_number       text not null,
  uses               int  not null,
  -- median_cost / median_markup_pct are null when every source row for this
  -- SKU had unit_cost <= 0 (legacy import quirk). median_price is always set.
  median_cost        numeric(12,4),
  median_price       numeric(12,4) not null,
  median_markup_pct  numeric(10,2),
  -- last_* taken from the most-recent row by created_at_external, so the
  -- hover-detail "last used 3 May 2026" is a real transacted reference.
  last_price         numeric(12,4) not null,
  last_cost          numeric(12,4),
  last_used_date     date not null,
  refreshed_at       timestamptz not null default now(),
  primary key (organisation_id, stock_number)
);

comment on table sku_price_stats is
  'Precomputed per-org per-SKU pricing stats from historical_invoice_items. '
  'Refreshed manually via refresh_sku_price_stats(). v1 reads historical only.';

-- "Top SKUs by use" lookups for admin/debug; primary read path is PK.
create index if not exists idx_sku_stats_org_uses
  on sku_price_stats (organisation_id, uses desc);

alter table sku_price_stats enable row level security;

-- Read-only to tenants. Only the security-definer refresh function writes.
create policy "sku_stats_select_org" on sku_price_stats
  for select using (organisation_id = current_user_org_id());

-- ----------------------------------------------------------------------------
-- refresh_sku_price_stats(p_org)
--
-- Rebuilds the stats for one org (or all orgs when p_org is null). Returns
-- the number of (org, sku) rows written. Filters mirror the spec verbatim:
--   - non-empty stock_number
--   - stock_number <> 'LAB' (labour is its own SKU; excluded both sides)
--   - unit_price > 0
--   - created_at_external is not null
--   - HAVING count(*) >= 3 (validation guard against thin samples)
-- ----------------------------------------------------------------------------
create or replace function refresh_sku_price_stats(p_org uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows int := 0;
begin
  if p_org is null then
    delete from sku_price_stats;
  else
    delete from sku_price_stats where organisation_id = p_org;
  end if;

  with src as (
    select
      organisation_id,
      stock_number,
      unit_cost,
      unit_price,
      created_at_external
    from historical_invoice_items
    where stock_number is not null
      and stock_number <> ''
      and stock_number <> 'LAB'
      and unit_price > 0
      and created_at_external is not null
      and (p_org is null or organisation_id = p_org)
  ),
  agg as (
    select
      organisation_id,
      stock_number,
      count(*)::int                                                          as uses,
      percentile_cont(0.5) within group (order by unit_price)                as median_price,
      percentile_cont(0.5) within group (order by unit_cost)
        filter (where unit_cost > 0)                                         as median_cost,
      -- markup median only over rows with a positive cost (avoids div/0 and
      -- meaningless markup figures from $0 cost imports).
      percentile_cont(0.5) within group (order by ((unit_price - unit_cost) / unit_cost) * 100)
        filter (where unit_cost > 0)                                         as median_markup_pct,
      max(created_at_external::date)                                         as last_used_date
    from src
    group by organisation_id, stock_number
    having count(*) >= 3
  ),
  last_row as (
    -- distinct on picks the row with the latest created_at_external per
    -- (org, sku) — i.e. the most recent transacted sell of that SKU.
    select distinct on (organisation_id, stock_number)
      organisation_id,
      stock_number,
      unit_price as last_price,
      unit_cost  as last_cost
    from src
    order by organisation_id, stock_number, created_at_external desc
  )
  insert into sku_price_stats (
    organisation_id, stock_number, uses,
    median_cost, median_price, median_markup_pct,
    last_price, last_cost, last_used_date, refreshed_at
  )
  select
    a.organisation_id, a.stock_number, a.uses,
    a.median_cost, a.median_price, a.median_markup_pct,
    lr.last_price, lr.last_cost, a.last_used_date, now()
  from agg a
  join last_row lr
    on lr.organisation_id = a.organisation_id
   and lr.stock_number    = a.stock_number;

  get diagnostics v_rows = row_count;
  return v_rows;
end
$$;

comment on function refresh_sku_price_stats(uuid) is
  'Rebuilds sku_price_stats from historical_invoice_items for one org '
  '(or all orgs when p_org is null). Returns rows written. v1: invoked '
  'manually; no automatic trigger.';

-- Application roles never call this directly. The migration below invokes it
-- for Carafix; future admin tooling can re-run via service role.
revoke all on function refresh_sku_price_stats(uuid) from public;

-- Populate Carafix (org id from migration 0013 seed; matches the project's
-- single live tenant). All other orgs will be empty until refresh is called
-- for them — by design.
select refresh_sku_price_stats('00000000-0000-0000-0000-000000000002'::uuid);
