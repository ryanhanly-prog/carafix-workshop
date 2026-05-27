-- Step 4a.5: surface the canonical job-type NAME in find_similar_quotes match
-- reasons (was a bare 'job_type'). CREATE OR REPLACE — identical signature/return,
-- only the match_reasons string for the job-type component changes.

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
  with cand as (
    select
      hq.id, 'historical'::text as source, hq.vehicle_make as make, hq.vehicle_model as model,
      coalesce(hq.search_tokens, '{}') as tokens,
      coalesce(hq.inferred_damage_tags, '{}') as dmg_tags,
      hq.resolved_canonical_job_type_id as canon,
      hq.total_amount as total,
      hq.total_labour_hours as labour_hours,
      hq.issue_date,
      (select count(*) from historical_quote_items qi where qi.quote_id = hq.id) as line_count,
      (select coalesce(sum(qi.total_amount), 0) from historical_quote_items qi
         where qi.quote_id = hq.id and not (lower(coalesce(qi.stock_category, qi.category, qi.description, '')) like '%labour%')) as parts_total,
      (select coalesce(sum(qi.total_amount), 0) from historical_quote_items qi
         where qi.quote_id = hq.id and lower(coalesce(qi.stock_category, qi.category, qi.description, '')) like '%labour%') as labour_total,
      left(coalesce(hq.combined_search_text, ''), 80) as preview
    from historical_quotes hq
    where hq.organisation_id = p_organisation_id
      and (p_exclude_quote_id is null or hq.id <> p_exclude_quote_id)

    union all

    select
      q.id, 'live'::text as source, v.make, v.model,
      tokenize_for_similarity(
        coalesce(q.description, '') || ' ' ||
        coalesce((select string_agg(li.description, ' ') from quote_line_items li where li.quote_id = q.id), ''),
        p_organisation_id) as tokens,
      coalesce(q.damage_tags, '{}') as dmg_tags,
      q.canonical_job_type_id as canon,
      q.total,
      (select coalesce(sum(li.quantity), 0) from quote_line_items li where li.quote_id = q.id and li.line_type = 'labour') as labour_hours,
      q.created_at::date as issue_date,
      (select count(*) from quote_line_items li where li.quote_id = q.id) as line_count,
      (select coalesce(sum(li.line_total), 0) from quote_line_items li where li.quote_id = q.id and li.line_type = 'part') as parts_total,
      (select coalesce(sum(li.line_total), 0) from quote_line_items li where li.quote_id = q.id and li.line_type = 'labour') as labour_total,
      left(coalesce(q.description, ''), 80) as preview
    from quotes q
    left join vans v on v.id = q.vehicle_id
    where q.organisation_id = p_organisation_id and q.status <> 'cancelled'
      and (p_exclude_quote_id is null or q.id <> p_exclude_quote_id)
  ),
  scored as (
    select c.*,
      array(select unnest(p_damage_tags) intersect select unnest(c.dmg_tags)) as overlap_tags,
      jaccard_arr(qtok, c.tokens) as jac
    from cand c
  )
  select
    s.id, s.source,
    ( (case when p_vehicle_make is not null and lower(s.make) = lower(p_vehicle_make) then 25 else 0 end)
    + (case when p_vehicle_model is not null and lower(s.model) = lower(p_vehicle_model) then 15 else 0 end)
    + (case when p_canonical_job_type_id is not null and s.canon = p_canonical_job_type_id then 30 else 0 end)
    + (case when p_damage_tags is not null and coalesce(array_length(p_damage_tags, 1), 0) > 0
            then 40 * cardinality(s.overlap_tags)::numeric / array_length(p_damage_tags, 1) else 0 end)
    + (60 * s.jac)
    + (case when s.issue_date is not null and s.issue_date >= (now()::date - 365) then 5 else 0 end)
    )::numeric as score,
    nullif(trim(coalesce(s.make, '') || ' ' || coalesce(s.model, '')), '') as vehicle,
    s.preview as preview_text,
    ( (case when p_vehicle_make is not null and lower(s.make) = lower(p_vehicle_make) then array['vehicle_make'] else '{}'::text[] end)
    || (case when p_vehicle_model is not null and lower(s.model) = lower(p_vehicle_model) then array['vehicle_model'] else '{}'::text[] end)
    || (case when cardinality(s.overlap_tags) > 0 then array['damage_tags:' || array_to_string(s.overlap_tags, ',')] else '{}'::text[] end)
    || (case when s.jac > 0.05 then array['description_match'] else '{}'::text[] end)
    || (case when p_canonical_job_type_id is not null and s.canon = p_canonical_job_type_id
             then array['job_type:' || coalesce(jt_name, 'job type')] else '{}'::text[] end)
    || (case when s.issue_date is not null and s.issue_date >= (now()::date - 365) then array['recent'] else '{}'::text[] end)
    ) as match_reasons,
    s.line_count, s.total, s.parts_total, s.labour_total, s.labour_hours as total_labour_hours, s.issue_date
  from scored s
  order by score desc, s.issue_date desc nulls last
  limit 5;
end $$;
