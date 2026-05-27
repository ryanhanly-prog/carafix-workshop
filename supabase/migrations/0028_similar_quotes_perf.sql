-- Step 4a.6: fix the find_similar_quotes statement-timeout in production.
--
-- Problem: the old `cand` CTE ran 3 correlated subqueries per row (line_count,
-- parts_total, labour_total) across ALL 1,288 historical_quotes + the live
-- quotes — thousands of subquery invocations per call (~5.6s measured on
-- Q-100006), tripping the Postgres statement timeout.
--
-- Fix: score on cheap columns only, ORDER BY + LIMIT 5, then run the expensive
-- item aggregations + preview lookup on just those 5 winners (~20 subqueries
-- total). CREATE OR REPLACE — identical 7-arg signature and return shape; the
-- scoring weights and match_reasons (including the 4a.5 job_type:<name>) are
-- byte-for-byte unchanged, so ranking/output match the old function exactly.
--
-- total_labour_hours reads the backfilled historical_quotes column directly
-- (no subquery); live quotes (a handful of rows) compute it inline in the cheap
-- CTE. preview_text is looked up only for the 5 winners.

create or replace function find_similar_quotes(
  p_organisation_id uuid,
  p_canonical_job_type_id uuid,
  p_vehicle_make text,
  p_vehicle_model text,
  p_description text,
  p_damage_tags text[],
  p_exclude_quote_id uuid default null
) returns table (
  id uuid,
  source text,
  score numeric,
  vehicle text,
  preview_text text,
  match_reasons text[],
  line_count bigint,
  total numeric,
  parts_total numeric,
  labour_total numeric,
  total_labour_hours numeric,
  issue_date date
) language plpgsql stable security invoker set search_path = public as $$
declare
  qtok text[];
  jt_name text;
begin
  qtok := tokenize_for_similarity(p_description, p_organisation_id);
  select jtc.name into jt_name from job_type_canonical jtc where jtc.id = p_canonical_job_type_id;
  return query
  -- 1. Candidates with ONLY the columns scoring needs — no per-row item subqueries.
  --    Historical reads precomputed columns (search_tokens, inferred_damage_tags,
  --    total_labour_hours). Live is a handful of rows, so tokenising + the labour-
  --    hours sum inline here is cheap.
  with cand_cheap as (
    select
      hq.id                                   as id,
      'historical'::text                      as source,
      hq.vehicle_make                         as make,
      hq.vehicle_model                        as model,
      coalesce(hq.search_tokens, '{}')        as tokens,
      coalesce(hq.inferred_damage_tags, '{}') as dmg_tags,
      hq.resolved_canonical_job_type_id       as canon,
      hq.total_amount                         as total,
      hq.total_labour_hours                   as labour_hours,
      hq.issue_date                           as issue_date
    from historical_quotes hq
    where hq.organisation_id = p_organisation_id
      and (p_exclude_quote_id is null or hq.id <> p_exclude_quote_id)

    union all

    select
      q.id,
      'live'::text,
      v.make,
      v.model,
      tokenize_for_similarity(
        coalesce(q.description, '') || ' ' ||
        coalesce((select string_agg(li.description, ' ') from quote_line_items li where li.quote_id = q.id), ''),
        p_organisation_id),
      coalesce(q.damage_tags, '{}'),
      q.canonical_job_type_id,
      q.total,
      (select coalesce(sum(li.quantity), 0) from quote_line_items li where li.quote_id = q.id and li.line_type = 'labour'),
      q.created_at::date
    from quotes q
    left join vans v on v.id = q.vehicle_id
    where q.organisation_id = p_organisation_id and q.status <> 'cancelled'
      and (p_exclude_quote_id is null or q.id <> p_exclude_quote_id)
  ),
  -- 2. Score every candidate + build match_reasons (cheap array ops only). The
  --    inner subselect computes overlap_tags + Jaccard once so both the score and
  --    the reasons reuse them.
  scored as (
    select
      x.id, x.source, x.make, x.model, x.total, x.labour_hours, x.issue_date,
      ( (case when p_vehicle_make is not null and lower(x.make) = lower(p_vehicle_make) then 25 else 0 end)
      + (case when p_vehicle_model is not null and lower(x.model) = lower(p_vehicle_model) then 15 else 0 end)
      + (case when p_canonical_job_type_id is not null and x.canon = p_canonical_job_type_id then 30 else 0 end)
      + (case when p_damage_tags is not null and coalesce(array_length(p_damage_tags, 1), 0) > 0
              then 40 * cardinality(x.overlap_tags)::numeric / array_length(p_damage_tags, 1) else 0 end)
      + (60 * x.jac)
      + (case when x.issue_date is not null and x.issue_date >= (now()::date - 365) then 5 else 0 end)
      )::numeric as score_val,
      ( (case when p_vehicle_make is not null and lower(x.make) = lower(p_vehicle_make) then array['vehicle_make'] else '{}'::text[] end)
      || (case when p_vehicle_model is not null and lower(x.model) = lower(p_vehicle_model) then array['vehicle_model'] else '{}'::text[] end)
      || (case when cardinality(x.overlap_tags) > 0 then array['damage_tags:' || array_to_string(x.overlap_tags, ',')] else '{}'::text[] end)
      || (case when x.jac > 0.05 then array['description_match'] else '{}'::text[] end)
      || (case when p_canonical_job_type_id is not null and x.canon = p_canonical_job_type_id
               then array['job_type:' || coalesce(jt_name, 'job type')] else '{}'::text[] end)
      || (case when x.issue_date is not null and x.issue_date >= (now()::date - 365) then array['recent'] else '{}'::text[] end)
      ) as match_reasons
    from (
      select c.*,
        array(select unnest(p_damage_tags) intersect select unnest(c.dmg_tags)) as overlap_tags,
        jaccard_arr(qtok, c.tokens) as jac
      from cand_cheap c
    ) x
  ),
  -- 3. Keep only the 5 winners — the ONLY rows we run expensive lookups on.
  top as (
    select * from scored
    order by score_val desc, issue_date desc nulls last
    limit 5
  )
  -- 4. Expensive item aggregations + preview, now over just 5 rows (~20 subqueries).
  select
    t.id,
    t.source,
    t.score_val,
    nullif(trim(coalesce(t.make, '') || ' ' || coalesce(t.model, '')), '') as vehicle,
    case when t.source = 'historical'
      then left(coalesce((select hq.combined_search_text from historical_quotes hq where hq.id = t.id), ''), 80)
      else left(coalesce((select q.description from quotes q where q.id = t.id), ''), 80)
    end as preview_text,
    t.match_reasons,
    case when t.source = 'historical'
      then (select count(*) from historical_quote_items qi where qi.quote_id = t.id)
      else (select count(*) from quote_line_items li where li.quote_id = t.id)
    end as line_count,
    t.total,
    case when t.source = 'historical'
      then (select coalesce(sum(qi.total_amount), 0) from historical_quote_items qi
              where qi.quote_id = t.id and not (lower(coalesce(qi.stock_category, qi.category, qi.description, '')) like '%labour%'))
      else (select coalesce(sum(li.line_total), 0) from quote_line_items li where li.quote_id = t.id and li.line_type = 'part')
    end as parts_total,
    case when t.source = 'historical'
      then (select coalesce(sum(qi.total_amount), 0) from historical_quote_items qi
              where qi.quote_id = t.id and lower(coalesce(qi.stock_category, qi.category, qi.description, '')) like '%labour%')
      else (select coalesce(sum(li.line_total), 0) from quote_line_items li where li.quote_id = t.id and li.line_type = 'labour')
    end as labour_total,
    t.labour_hours as total_labour_hours,
    t.issue_date
  from top t
  order by t.score_val desc, t.issue_date desc nulls last;
end $$;

grant execute on function find_similar_quotes(uuid, uuid, text, text, text, text[], uuid) to authenticated;
