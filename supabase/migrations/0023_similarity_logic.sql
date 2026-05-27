-- Step 4a.1: similarity overhaul — tokeniser, damage-tag inference, rewritten
-- find_similar_quotes, and set-based backfill functions.

-- Precomputed tokens for historical quotes (perf: avoids re-tokenising 1,288
-- candidates on every panel query). Populated by the backfill + the trigger below.
alter table historical_quotes add column if not exists search_tokens text[];

-- ----------------------------------------------------------------------------
-- Tokeniser: lowercase -> strip boilerplate -> de-punctuate (keep hyphens) ->
-- split -> drop stopwords / short tokens -> light stemming -> dedupe.
-- Fails silently if the boilerplate table/rows are absent.
-- ----------------------------------------------------------------------------
create or replace function tokenize_for_similarity(p_text text, p_org_id uuid)
returns text[] language plpgsql stable security invoker set search_path = public as $$
declare
  t text;
  ph record;
  tok text;
  stem text;
  result text[] := '{}';
  stopwords text[] := array['and','the','for','with','was','were','are','this','that','its','from','our','your','you','not','all','any','per','has','have','will','they','their','than','then','but','out','off','one','two','new','etc','due'];
begin
  if p_text is null or btrim(p_text) = '' then return '{}'; end if;
  t := lower(p_text);
  begin
    for ph in select phrase from text_boilerplate_phrases where organisation_id = p_org_id loop
      t := replace(t, ph.phrase, ' ');
    end loop;
  exception when others then
    null; -- fail silently if the table is missing
  end;
  t := regexp_replace(t, '[^a-z0-9 -]', ' ', 'g');
  for tok in select unnest(regexp_split_to_array(t, '\s+')) loop
    tok := btrim(tok, '-');
    continue when tok is null or length(tok) < 3;
    continue when tok = any(stopwords);
    stem := tok;
    if length(stem) > 4 and stem like '%ing' then stem := left(stem, length(stem) - 3);
    elsif length(stem) > 4 and stem like '%ed' then stem := left(stem, length(stem) - 2);
    elsif length(stem) > 3 and stem like '%s' then stem := left(stem, length(stem) - 1);
    end if;
    if length(stem) >= 3 and not (stem = any(result)) then
      result := array_append(result, stem);
    end if;
  end loop;
  return result;
end $$;

-- Token-array Jaccard
create or replace function jaccard_arr(a text[], b text[])
returns numeric language sql immutable set search_path = public as $$
  select case
    when a is null or b is null or cardinality(a) = 0 or cardinality(b) = 0 then 0
    else (select count(*) from (select unnest(a) intersect select unnest(b)) i)::numeric
       / nullif((select count(*) from (select unnest(a) union select unnest(b)) u), 0)
  end;
$$;

-- Combined text for a historical quote (description + comments + line items).
create or replace function compute_combined_search_text(p_quote_id uuid)
returns text language sql stable security invoker set search_path = public as $$
  select btrim(
    coalesce(hq.description, '') || ' ' || coalesce(hq.comments, '') || ' ' ||
    left(coalesce((
      select string_agg(coalesce(qi.description, qi.stock_name, ''), ' ')
      from historical_quote_items qi where qi.quote_id = hq.id
    ), ''), 500)
  )
  from historical_quotes hq where hq.id = p_quote_id;
$$;

-- Damage-tag inference: stem-aware match of tokens against a canonical keyword set.
create or replace function infer_damage_tags(p_tokens text[])
returns text[] language plpgsql immutable set search_path = public as $$
declare
  tags text[] := array['hail','water','leak','panel','mould','awning','decal','sticker','axle',
    'suspension','brake','wheel','roof','ceiling','floor','wall','door','window','lock','hatch',
    'slide','slideout','seal','electrical','gas','plumbing','fridge','hotwater','aircon','light',
    'jack','hitch','chassis','impact','collision','scratch','scrape','dent','crack'];
  tag text; tok text; matched text[] := '{}'; root text;
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
  return matched;
end $$;

-- Keep combined_search_text + search_tokens fresh when line items change
-- (statement-level, for bulk re-imports). inferred_damage_tags / total_labour_hours
-- remain backfill-only.
create or replace function trg_hqi_recompute_text()
returns trigger language plpgsql security invoker set search_path = public as $$
declare q uuid;
begin
  if tg_op = 'DELETE' then
    for q in select distinct quote_id from old_rows where quote_id is not null loop
      update historical_quotes hq set combined_search_text = c.txt,
        search_tokens = tokenize_for_similarity(c.txt, hq.organisation_id)
      from (select compute_combined_search_text(q) as txt) c where hq.id = q;
    end loop;
  elsif tg_op = 'INSERT' then
    for q in select distinct quote_id from new_rows where quote_id is not null loop
      update historical_quotes hq set combined_search_text = c.txt,
        search_tokens = tokenize_for_similarity(c.txt, hq.organisation_id)
      from (select compute_combined_search_text(q) as txt) c where hq.id = q;
    end loop;
  else
    for q in (select distinct quote_id from new_rows where quote_id is not null
              union select distinct quote_id from old_rows where quote_id is not null) loop
      update historical_quotes hq set combined_search_text = c.txt,
        search_tokens = tokenize_for_similarity(c.txt, hq.organisation_id)
      from (select compute_combined_search_text(q) as txt) c where hq.id = q;
    end loop;
  end if;
  return null;
end $$;

create trigger trg_hqi_text_ins after insert on historical_quote_items
  referencing new table as new_rows for each statement execute function trg_hqi_recompute_text();
create trigger trg_hqi_text_del after delete on historical_quote_items
  referencing old table as old_rows for each statement execute function trg_hqi_recompute_text();
create trigger trg_hqi_text_upd after update on historical_quote_items
  referencing old table as old_rows new table as new_rows for each statement execute function trg_hqi_recompute_text();

-- ----------------------------------------------------------------------------
-- Rewritten find_similar_quotes (return shape changes -> drop + create).
-- ----------------------------------------------------------------------------
drop function if exists find_similar_quotes(uuid, uuid, text, text, text, text[]);
create function find_similar_quotes(
  p_organisation_id uuid,
  p_canonical_job_type_id uuid,
  p_vehicle_make text,
  p_vehicle_model text,
  p_description text,
  p_damage_tags text[]
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

-- ----------------------------------------------------------------------------
-- Backfill functions (set-based; called by scripts/backfill-historical-similarity.ts)
-- ----------------------------------------------------------------------------
create or replace function backfill_combined_search_text(p_org uuid)
returns int language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  update historical_quotes hq
    set combined_search_text = c.txt,
        search_tokens = tokenize_for_similarity(c.txt, p_org)
  from (select id, compute_combined_search_text(id) as txt
        from historical_quotes where organisation_id = p_org) c
  where hq.id = c.id;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function backfill_total_labour_hours(p_org uuid)
returns int language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  update historical_quotes hq set total_labour_hours = coalesce((
    select sum(qi.quantity) from historical_quote_items qi
    where qi.quote_id = hq.id
      and lower(coalesce(qi.stock_category, qi.category, qi.description, '')) like '%labour%'
  ), 0)
  where hq.organisation_id = p_org;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function backfill_inferred_damage_tags(p_org uuid)
returns int language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  update historical_quotes
    set inferred_damage_tags = infer_damage_tags(coalesce(search_tokens, '{}'))
  where organisation_id = p_org;
  get diagnostics n = row_count;
  -- return how many got at least one tag
  return (select count(*) from historical_quotes
          where organisation_id = p_org and coalesce(array_length(inferred_damage_tags, 1), 0) > 0);
end $$;

-- Resolve canonical job type via the matched job/invoice's RAW label looked up
-- through the CURRENT (confirmed) alias mapping (Option A). Org-explicit so it
-- works under the service-role backfill. Auto-improves as aliases get mapped.
create or replace function backfill_resolved_canonical(p_org uuid)
returns int language plpgsql security invoker set search_path = public as $$
begin
  update historical_quotes hq set resolved_canonical_job_type_id = coalesce(
    (select a.canonical_id
       from historical_jobs j
       join job_type_aliases a
         on a.organisation_id = p_org and a.raw_value = j.job_type_raw and a.canonical_id is not null
      where j.organisation_id = p_org
        and j.customer_external_id = hq.customer_external_id
        and j.created_date is not null and hq.issue_date is not null
        and abs(j.created_date - hq.issue_date) <= 90
      order by abs(j.created_date - hq.issue_date)
      limit 1),
    (select a.canonical_id
       from historical_invoices i
       join job_type_aliases a
         on a.organisation_id = p_org and a.raw_value = i.first_job_type and a.canonical_id is not null
      where i.organisation_id = p_org
        and i.customer_external_id = hq.customer_external_id
        and i.issue_date is not null and hq.issue_date is not null
        and abs(i.issue_date - hq.issue_date) <= 90
      order by abs(i.issue_date - hq.issue_date)
      limit 1)
  )
  where hq.organisation_id = p_org and hq.customer_external_id is not null;
  return (select count(*) from historical_quotes
          where organisation_id = p_org and resolved_canonical_job_type_id is not null);
end $$;

grant execute on function tokenize_for_similarity(text, uuid) to authenticated;
grant execute on function jaccard_arr(text[], text[]) to authenticated;
grant execute on function compute_combined_search_text(uuid) to authenticated;
grant execute on function infer_damage_tags(text[]) to authenticated;
grant execute on function find_similar_quotes(uuid, uuid, text, text, text, text[]) to authenticated;
grant execute on function backfill_combined_search_text(uuid) to authenticated;
grant execute on function backfill_total_labour_hours(uuid) to authenticated;
grant execute on function backfill_inferred_damage_tags(uuid) to authenticated;
grant execute on function backfill_resolved_canonical(uuid) to authenticated;
