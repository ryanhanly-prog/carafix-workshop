-- Step 4a.2: damage-tag auto-suggest + similar-quotes self-exclusion.

-- ---- Layer 1: job-type default damage tags ----
alter table job_type_canonical add column if not exists default_damage_tags text[];

update job_type_canonical set default_damage_tags = case slug
  when 'storm_damage'            then array['hail','water','panel','roof']
  when 'impact_damage'           then array['panel','mould','decal','impact']
  when 'awning_repair'           then array['awning','awning_rail','fabric']
  when 'water_damage'            then array['water','leak','seal','mould']
  when 'pre_purchase_inspection' then array[]::text[]
  when 'insurance_inspection'    then array[]::text[]
  when 'insurance_repair'        then array['panel','mould','decal']
  when 'chassis_suspension'      then array['chassis','suspension','axle','brake']
  when 'electrical_repair'       then array['electrical','light','wiring']
  when 'plumbing_gas_repair'     then array['plumbing','gas','water','leak']
  when 'tandem_axle_service'     then array['axle','brake','wheel','suspension']
  when 'single_axle_service'     then array['axle','brake','wheel']
  when 'slide_out_service'       then array['slide','slideout','seal']
  when 'first_service'           then array[]::text[]
  when 'annual_service'          then array[]::text[]
  when 'logbook_service'         then array[]::text[]
  when 'warranty_work'           then array[]::text[]
  when 'upgrade_install'         then array[]::text[]
  when 'other'                   then array[]::text[]
  else default_damage_tags
end
where organisation_id = '00000000-0000-0000-0000-000000000002';

-- ---- Extend the single canonical damage-tag keyword source (used by Layer 2 +
-- the 4a.1 backfill). Adds fabric / wiring and a 'rail' -> awning_rail alias. ----
create or replace function infer_damage_tags(p_tokens text[])
returns text[] language plpgsql immutable set search_path = public as $$
declare
  tags text[] := array['hail','water','leak','panel','mould','awning','decal','sticker','axle',
    'suspension','brake','wheel','roof','ceiling','floor','wall','door','window','lock','hatch',
    'slide','slideout','seal','electrical','gas','plumbing','fridge','hotwater','aircon','light',
    'jack','hitch','chassis','impact','collision','scratch','scrape','dent','crack','fabric','wiring'];
  aliases text[] := array['rail|awning_rail'];  -- searchkeyword|output_tag
  tag text; tok text; matched text[] := '{}'; root text;
  al text; parts text[]; kw text; outtag text;
begin
  if p_tokens is null then return '{}'; end if;
  foreach tag in array tags loop
    root := tag;
    if length(root) > 4 and root like '%ing' then root := left(root, length(root) - 3);
    elsif length(root) > 4 and root like '%ed' then root := left(root, length(root) - 2);
    elsif length(root) > 3 and root like '%s' then root := left(root, length(root) - 1);
    end if;
    foreach tok in array p_tokens loop
      if tok = root or tok = tag or (length(root) >= 4 and tok like root || '%') then
        if not (tag = any(matched)) then matched := array_append(matched, tag); end if;
        exit;
      end if;
    end loop;
  end loop;
  foreach al in array aliases loop
    parts := string_to_array(al, '|');
    kw := parts[1]; outtag := parts[2];
    root := kw;
    if length(root) > 4 and root like '%ing' then root := left(root, length(root) - 3);
    elsif length(root) > 4 and root like '%ed' then root := left(root, length(root) - 2);
    elsif length(root) > 3 and root like '%s' then root := left(root, length(root) - 1);
    end if;
    foreach tok in array p_tokens loop
      if tok = root or tok = kw or (length(root) >= 4 and tok like root || '%') then
        if not (outtag = any(matched)) then matched := array_append(matched, outtag); end if;
        exit;
      end if;
    end loop;
  end loop;
  return matched;
end $$;

-- Single rpc for the live description -> tag suggestion (single source of truth:
-- the same tokeniser + infer list).
create or replace function suggest_damage_tags(p_text text, p_org uuid)
returns text[] language sql stable security invoker set search_path = public as $$
  select infer_damage_tags(tokenize_for_similarity(p_text, p_org));
$$;

-- ---- Issue 1: add p_exclude_quote_id so a quote never matches itself. No score
-- threshold anywhere — every row the function returns is shown. ----
drop function if exists find_similar_quotes(uuid, uuid, text, text, text, text[]);
create function find_similar_quotes(
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
declare qtok text[];
begin
  qtok := tokenize_for_similarity(p_description, p_organisation_id);
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
    || (case when p_canonical_job_type_id is not null and s.canon = p_canonical_job_type_id then array['job_type'] else '{}'::text[] end)
    || (case when s.issue_date is not null and s.issue_date >= (now()::date - 365) then array['recent'] else '{}'::text[] end)
    ) as match_reasons,
    s.line_count, s.total, s.parts_total, s.labour_total, s.labour_hours as total_labour_hours, s.issue_date
  from scored s
  order by score desc, s.issue_date desc nulls last
  limit 5;
end $$;

grant execute on function infer_damage_tags(text[]) to authenticated;
grant execute on function suggest_damage_tags(text, uuid) to authenticated;
grant execute on function find_similar_quotes(uuid, uuid, text, text, text, text[], uuid) to authenticated;
