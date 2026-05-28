-- 0030 — get_quote_anchors(p_quote_id)
--
-- Returns one row per PART line of a quote with the resolved SKU, the
-- precomputed stats from sku_price_stats, a below_typical_pct (null unless
-- the line is >5% below the SKU median), and a quote-level allow_nudge
-- boolean (false on insurance/warranty per verified fact #6). One round-trip
-- per quote load; UI never re-derives the gating.
--
-- Resolution priority (per spec):
--   1. part_id is not null  → stock_items.stock_number ('part_id')
--   2. else                 → trim(split_part(description, ' - ', 1)) ('description_parse')
-- A resolved candidate that isn't in sku_price_stats simply returns null
-- stats (the validation guard — count >= 3 is already enforced on the stats
-- table itself).
--
-- Scope: line_type = 'part' only. Labour ('labour') and dividers
-- ('other' with zero qty/cost/total) are naturally excluded by this filter
-- as part of Q-100001 self-test confirmation that CONSUM and friends are
-- stored as 'part' on real quotes. line_type='other' real lines (like
-- freight stored that way) are intentionally not anchored in v1 — they
-- rarely have a meaningful SKU.
--
-- security invoker: RLS on quotes/lines/stock_items/sku_price_stats already
-- scopes per-org. No need for definer.

create or replace function get_quote_anchors(p_quote_id uuid)
returns table (
  quote_id              uuid,
  line_id               uuid,
  line_order            int,
  line_type             text,
  resolved_stock_number text,
  resolution_source     text,  -- 'part_id' | 'description_parse' | null
  uses                  int,
  median_cost           numeric,
  median_price          numeric,
  median_markup_pct     numeric,
  last_price            numeric,
  last_cost             numeric,
  last_used_date        date,
  below_typical_pct     numeric,  -- null unless unit_price < median * 0.95
  allow_nudge           boolean   -- quote-level; identical on every row
)
language sql
stable
security invoker
set search_path = public
as $$
  with q as (
    select
      qs.id,
      qs.organisation_id,
      -- Allow nudges only on customer-pays retail work. NULL category → false
      -- (conservative: don't nudge when we can't tell).
      (jtc.category is not null and jtc.category not in ('insurance', 'warranty'))
        as allow_nudge
    from quotes qs
    left join job_type_canonical jtc on jtc.id = qs.canonical_job_type_id
    where qs.id = p_quote_id
  ),
  lines as (
    select
      qli.id        as line_id,
      qli.quote_id,
      qli.line_order,
      qli.line_type,
      qli.unit_price,
      -- Resolve SKU: part_id first (forward-looking; future parts-picker
      -- will populate), else parse the description prefix. ' - ' is safe
      -- because historical SKUs never contain ' - ' (verified fact #4).
      case
        when qli.part_id is not null then
          (select si.stock_number from stock_items si where si.id = qli.part_id)
        else
          nullif(trim(split_part(coalesce(qli.description, ''), ' - ', 1)), '')
      end as resolved_stock_number,
      case
        when qli.part_id is not null then 'part_id'
        when nullif(trim(split_part(coalesce(qli.description, ''), ' - ', 1)), '') is not null
          then 'description_parse'
        else null
      end as resolution_source
    from quote_line_items qli
    where qli.quote_id = p_quote_id
      and qli.line_type = 'part'
  )
  select
    l.quote_id,
    l.line_id,
    l.line_order,
    l.line_type,
    l.resolved_stock_number,
    l.resolution_source,
    sps.uses,
    sps.median_cost,
    sps.median_price,
    sps.median_markup_pct,
    sps.last_price,
    sps.last_cost,
    sps.last_used_date,
    -- Below-norm: only flag the under-direction, and only when we have a
    -- positive median to compare against. Threshold 5% per spec.
    case
      when sps.median_price is not null
       and sps.median_price > 0
       and l.unit_price is not null
       and l.unit_price < sps.median_price * 0.95
      then round((1 - l.unit_price / sps.median_price) * 100, 1)
      else null
    end as below_typical_pct,
    q.allow_nudge
  from lines l
  cross join q
  left join sku_price_stats sps
    on sps.organisation_id = q.organisation_id
   and sps.stock_number    = l.resolved_stock_number
  order by l.line_order
$$;

comment on function get_quote_anchors(uuid) is
  'Returns per-part-line anchor data (resolved SKU + stats + below_typical_pct) '
  'plus a quote-level allow_nudge flag (false on insurance/warranty). One '
  'call per quote load. Read get_quote_anchors.sql for resolution priority.';

-- Application roles call this — grant execute. RLS on the underlying tables
-- enforces tenancy.
grant execute on function get_quote_anchors(uuid) to authenticated;
