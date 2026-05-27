-- Step 4a.1: similarity overhaul — schema.
-- combined_search_text is populated by a backfill script + a trigger (it
-- references line items, so it can't be a generated column).

alter table historical_quotes add column if not exists inferred_damage_tags text[];
alter table historical_quotes add column if not exists combined_search_text text;
alter table historical_quotes add column if not exists total_labour_hours numeric;

-- Boilerplate phrases stripped before tokenisation. Org-scoped + table-backed so
-- a future settings screen can let Catherine/James edit them.
create table text_boilerplate_phrases (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id),
  phrase text not null,
  created_at timestamptz default now(),
  unique (organisation_id, phrase)
);

alter table text_boilerplate_phrases enable row level security;
create policy "boilerplate org" on text_boilerplate_phrases for all
  using (organisation_id = current_user_org_id())
  with check (organisation_id = current_user_org_id());

insert into text_boilerplate_phrases (organisation_id, phrase) values
  ('00000000-0000-0000-0000-000000000002', 'thank you for the opportunity'),
  ('00000000-0000-0000-0000-000000000002', 'this estimate is based on'),
  ('00000000-0000-0000-0000-000000000002', 'this is an estimate only'),
  ('00000000-0000-0000-0000-000000000002', 'further damage may be evident'),
  ('00000000-0000-0000-0000-000000000002', 'after dismantling'),
  ('00000000-0000-0000-0000-000000000002', 'owner supplied images'),
  ('00000000-0000-0000-0000-000000000002', 'information supplied'),
  ('00000000-0000-0000-0000-000000000002', 'thank you for your business'),
  ('00000000-0000-0000-0000-000000000002', 'continued support'),
  ('00000000-0000-0000-0000-000000000002', 'visual inspection')
on conflict (organisation_id, phrase) do nothing;
