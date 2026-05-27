-- Step 4a: quote business logic — functions + triggers.
-- All SECURITY INVOKER so they respect org-scoped RLS; granted to authenticated
-- for rpc use.

-- ----------------------------------------------------------------------------
-- Totals recomputation. Statement-level (FOR EACH STATEMENT) using transition
-- tables, so cloning 20 lines triggers ONE recompute per affected quote.
-- ----------------------------------------------------------------------------
create or replace function recompute_quote_totals(p_quote_id uuid)
returns void language sql security invoker set search_path = public as $$
  update quotes q set
    subtotal_parts = coalesce((select sum(line_total) from quote_line_items where quote_id = p_quote_id and line_type = 'part'), 0),
    subtotal_labour = coalesce((select sum(line_total) from quote_line_items where quote_id = p_quote_id and line_type = 'labour'), 0),
    subtotal_consumables = coalesce((select sum(line_total) from quote_line_items where quote_id = p_quote_id and line_type = 'consumable'), 0),
    subtotal_other = coalesce((select sum(line_total) from quote_line_items where quote_id = p_quote_id and line_type in ('freight','other')), 0),
    total = coalesce((select sum(line_total) from quote_line_items where quote_id = p_quote_id), 0)
  where q.id = p_quote_id;
$$;

create or replace function trg_qli_recompute()
returns trigger language plpgsql security invoker set search_path = public as $$
declare q uuid;
begin
  if tg_op = 'INSERT' then
    for q in select distinct quote_id from new_rows loop perform recompute_quote_totals(q); end loop;
  elsif tg_op = 'DELETE' then
    for q in select distinct quote_id from old_rows loop perform recompute_quote_totals(q); end loop;
  else
    for q in (select distinct quote_id from new_rows
              union select distinct quote_id from old_rows) loop
      perform recompute_quote_totals(q);
    end loop;
  end if;
  return null;
end $$;

create trigger trg_qli_recompute_ins after insert on quote_line_items
  referencing new table as new_rows for each statement execute function trg_qli_recompute();
create trigger trg_qli_recompute_del after delete on quote_line_items
  referencing old table as old_rows for each statement execute function trg_qli_recompute();
create trigger trg_qli_recompute_upd after update on quote_line_items
  referencing old table as old_rows new table as new_rows for each statement execute function trg_qli_recompute();

-- ----------------------------------------------------------------------------
-- Per-tenant quote numbering: Q-100001, Q-100002, …
-- ----------------------------------------------------------------------------
create or replace function assign_quote_number()
returns trigger language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  if new.quote_number is not null and new.quote_number <> '' then
    return new;
  end if;
  insert into quote_sequences (organisation_id, last_number)
    values (new.organisation_id, 100001)
    on conflict (organisation_id) do update set last_number = quote_sequences.last_number + 1
    returning last_number into n;
  new.quote_number := 'Q-' || n::text;
  return new;
end $$;

create trigger trg_quotes_assign_number before insert on quotes
  for each row execute function assign_quote_number();

-- ----------------------------------------------------------------------------
-- sent_at auto-set on status -> 'sent'
-- ----------------------------------------------------------------------------
create or replace function set_quote_sent_at()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'sent' and (old.status is distinct from 'sent') and new.sent_at is null then
    new.sent_at := now();
  end if;
  return new;
end $$;

create trigger trg_quotes_sent_at before update on quotes
  for each row execute function set_quote_sent_at();

-- ----------------------------------------------------------------------------
-- Labour rate for new labour lines
-- ----------------------------------------------------------------------------
create or replace function compute_labour_rate(p_quote_id uuid)
returns numeric language plpgsql stable security invoker set search_path = public as $$
declare d record; r numeric;
begin
  select jtd.labour_rate_source as src, jtd.workshop_retail_rate as wr, q.insurer_id as ins
    into d
  from quotes q
  join job_type_defaults jtd
    on jtd.canonical_job_type_id = q.canonical_job_type_id
   and jtd.organisation_id = q.organisation_id
  where q.id = p_quote_id;
  if not found then return null; end if;

  if d.src = 'insurer_capped' then
    if d.ins is null then return null; end if;
    select capped_labour_rate into r from insurers where id = d.ins;
    return r;
  elsif d.src = 'workshop_retail' then
    return d.wr;
  elsif d.src = 'jayco_published' then
    return d.wr;  -- v1: treat as workshop_retail (TODO: Jayco per-component rate table)
  elsif d.src = 'cost_only' then
    return 0;
  end if;
  return null;
end $$;

-- ----------------------------------------------------------------------------
-- Silent parts-master capture into stock_items.
-- auto_created stubs mean "captured, pricing not curated" — so sell_price and
-- markup_percentage are left NULL (no quote-time markup baked in).
-- ----------------------------------------------------------------------------
create or replace function silent_save_part(
  p_organisation_id uuid,
  p_sku text,
  p_description text,
  p_supplier_id uuid,
  p_unit_cost numeric
) returns uuid language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  if p_sku is null or btrim(p_sku) = '' then
    return null;
  end if;
  select id into v_id from stock_items
    where organisation_id = p_organisation_id and stock_number = p_sku
    limit 1;
  if v_id is not null then
    return v_id;
  end if;
  insert into stock_items
    (organisation_id, stock_number, name, description, buy_price, sell_price, markup_percentage, auto_created, deactivated)
  values
    (p_organisation_id, p_sku, coalesce(nullif(left(p_description, 80), ''), p_sku), p_description,
     p_unit_cost, null, null, true, false)
  returning id into v_id;

  if p_supplier_id is not null then
    insert into stock_item_suppliers (stock_item_id, supplier_id, is_primary)
      values (v_id, p_supplier_id, true)
      on conflict (stock_item_id, supplier_id) do nothing;
  end if;
  return v_id;
end $$;

-- ----------------------------------------------------------------------------
-- Description token Jaccard helper
-- ----------------------------------------------------------------------------
create or replace function text_jaccard(a text, b text)
returns numeric language sql immutable set search_path = public as $$
  with ta as (
    select array(select distinct t from unnest(
      regexp_split_to_array(lower(regexp_replace(coalesce(a,''), '[^a-z0-9]+', ' ', 'g')), '\s+')) t
      where t <> '') arr),
  tb as (
    select array(select distinct t from unnest(
      regexp_split_to_array(lower(regexp_replace(coalesce(b,''), '[^a-z0-9]+', ' ', 'g')), '\s+')) t
      where t <> '') arr)
  select case
    when cardinality(ta.arr) = 0 or cardinality(tb.arr) = 0 then 0
    else (select count(*) from (select unnest(ta.arr) intersect select unnest(tb.arr)) i)::numeric
         / nullif((select count(*) from (select unnest(ta.arr) union select unnest(tb.arr)) u), 0)
  end
  from ta, tb;
$$;

-- ----------------------------------------------------------------------------
-- Find similar past quotes (historical + live), top 5 by score
-- ----------------------------------------------------------------------------
create or replace function find_similar_quotes(
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
  description text,
  line_count bigint,
  total numeric,
  created_at timestamptz
) language sql stable security invoker set search_path = public as $$
  select * from (
    select
      hq.id,
      'historical'::text as source,
      ( case when p_vehicle_make is not null and lower(hq.vehicle_make) = lower(p_vehicle_make) then 40 else 0 end
      + case when p_vehicle_model is not null and lower(hq.vehicle_model) = lower(p_vehicle_model) then 20 else 0 end
      + case when p_canonical_job_type_id is not null and hq.resolved_canonical_job_type_id = p_canonical_job_type_id then 30 else 0 end
      + 30 * text_jaccard(p_description, hq.description) )::numeric as score,
      nullif(trim(coalesce(hq.vehicle_make,'') || ' ' || coalesce(hq.vehicle_model,'')), '') as vehicle,
      hq.description,
      (select count(*) from historical_quote_items hi where hi.quote_id = hq.id) as line_count,
      hq.total_amount as total,
      hq.imported_at as created_at
    from historical_quotes hq
    where hq.organisation_id = p_organisation_id

    union all

    select
      q.id,
      'live'::text as source,
      ( case when p_vehicle_make is not null and lower(v.make) = lower(p_vehicle_make) then 40 else 0 end
      + case when p_vehicle_model is not null and lower(v.model) = lower(p_vehicle_model) then 20 else 0 end
      + case when p_canonical_job_type_id is not null and q.canonical_job_type_id = p_canonical_job_type_id then 30 else 0 end
      + 30 * text_jaccard(p_description, q.description)
      + case when p_damage_tags is not null and array_length(p_damage_tags,1) > 0 and q.damage_tags is not null
             then 20 * (select count(*) from (select unnest(p_damage_tags) intersect select unnest(q.damage_tags)) z)::numeric
                  / greatest(array_length(p_damage_tags,1), 1)
             else 0 end )::numeric as score,
      nullif(trim(coalesce(v.make,'') || ' ' || coalesce(v.model,'')), '') as vehicle,
      q.description,
      (select count(*) from quote_line_items li where li.quote_id = q.id) as line_count,
      q.total,
      q.created_at
    from quotes q
    left join vans v on v.id = q.vehicle_id
    where q.organisation_id = p_organisation_id
      and q.status <> 'cancelled'
  ) s
  order by s.score desc, s.created_at desc
  limit 5;
$$;

-- ----------------------------------------------------------------------------
-- Clone all lines from a source quote (historical or live) into a target quote
-- ----------------------------------------------------------------------------
create or replace function clone_quote(
  p_target_quote_id uuid,
  p_source_quote_id uuid,
  p_source_type text
) returns int language plpgsql security invoker set search_path = public as $$
declare v_org uuid; v_start int; v_count int := 0;
begin
  select organisation_id into v_org from quotes where id = p_target_quote_id;
  if v_org is null then raise exception 'target quote % not found', p_target_quote_id; end if;
  select coalesce(max(line_order), 0) into v_start from quote_line_items where quote_id = p_target_quote_id;

  if p_source_type = 'historical' then
    insert into quote_line_items
      (organisation_id, quote_id, line_order, line_type, description, quantity, unit, unit_cost, markup_pct, unit_price, line_total, source, source_quote_line_id)
    select
      v_org, p_target_quote_id,
      v_start + row_number() over (order by hi.id),
      case
        when lower(coalesce(hi.stock_category, hi.category, '')) like '%labour%'
          or lower(coalesce(hi.description, '')) like '%labour%' then 'labour'
        when hi.stock_number is not null and hi.stock_number <> '' then 'part'
        else 'other'
      end,
      coalesce(hi.description, hi.stock_name, 'Item'),
      coalesce(hi.quantity, 1),
      null,
      coalesce(hi.unit_cost, 0),
      0,
      coalesce(hi.unit_price, 0),
      coalesce(hi.total_amount, coalesce(hi.unit_price, 0) * coalesce(hi.quantity, 1)),
      'cloned',
      hi.id
    from historical_quote_items hi
    where hi.quote_id = p_source_quote_id and hi.organisation_id = v_org;
    get diagnostics v_count = row_count;
  else
    insert into quote_line_items
      (organisation_id, quote_id, line_order, line_type, part_id, supplier_id, description, quantity, unit, unit_cost, markup_pct, unit_price, line_total, source, source_quote_line_id, notes)
    select
      v_org, p_target_quote_id,
      v_start + row_number() over (order by li.line_order),
      li.line_type, li.part_id, li.supplier_id, li.description, li.quantity, li.unit,
      li.unit_cost, li.markup_pct, li.unit_price, li.line_total, 'cloned', li.id, li.notes
    from quote_line_items li
    where li.quote_id = p_source_quote_id and li.organisation_id = v_org;
    get diagnostics v_count = row_count;
  end if;

  perform recompute_quote_totals(p_target_quote_id);
  return v_count;
end $$;

-- ----------------------------------------------------------------------------
-- Config audit log triggers (insurers + job_type_defaults)
-- ----------------------------------------------------------------------------
create or replace function log_config_change()
returns trigger language plpgsql security invoker set search_path = public as $$
declare v_action text;
begin
  if tg_op = 'INSERT' then
    insert into config_audit_log (organisation_id, entity_type, entity_id, action, changed_fields, changed_by)
      values (new.organisation_id, tg_argv[0], new.id, 'create',
              jsonb_build_object('after', to_jsonb(new)), auth.uid());
    return new;
  elsif tg_op = 'UPDATE' then
    if tg_argv[0] = 'insurer' and (new.is_active is distinct from old.is_active) then
      v_action := case when new.is_active then 'activate' else 'deactivate' end;
    else
      v_action := 'update';
    end if;
    insert into config_audit_log (organisation_id, entity_type, entity_id, action, changed_fields, changed_by)
      values (new.organisation_id, tg_argv[0], new.id, v_action,
              jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)), auth.uid());
    return new;
  else
    insert into config_audit_log (organisation_id, entity_type, entity_id, action, changed_fields, changed_by)
      values (old.organisation_id, tg_argv[0], old.id, 'delete',
              jsonb_build_object('before', to_jsonb(old)), auth.uid());
    return old;
  end if;
end $$;

create trigger trg_audit_insurers after insert or update or delete on insurers
  for each row execute function log_config_change('insurer');
create trigger trg_audit_job_type_defaults after insert or update or delete on job_type_defaults
  for each row execute function log_config_change('job_type_default');

-- ----------------------------------------------------------------------------
-- Grants for rpc
-- ----------------------------------------------------------------------------
grant execute on function recompute_quote_totals(uuid) to authenticated;
grant execute on function compute_labour_rate(uuid) to authenticated;
grant execute on function silent_save_part(uuid, text, text, uuid, numeric) to authenticated;
grant execute on function text_jaccard(text, text) to authenticated;
grant execute on function find_similar_quotes(uuid, uuid, text, text, text, text[]) to authenticated;
grant execute on function clone_quote(uuid, uuid, text) to authenticated;
