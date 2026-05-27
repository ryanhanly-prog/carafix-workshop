-- Step 4a.3: unify imported caravans into the live `vans` table — schema.

alter table vans add column if not exists external_id text;
alter table vans add column if not exists chassis_number text;
alter table vans add column if not exists vin text;
alter table vans add column if not exists fleet_number text;
alter table vans add column if not exists vehicle_number text;
alter table vans add column if not exists imported_from text
  check (imported_from in ('mechanic_desk','manual')) default 'manual';
alter table vans add column if not exists imported_at timestamptz;
alter table vans add column if not exists manually_edited boolean default false;

-- Imported rows are matched/refreshed on this key; manual rows have NULL external_id.
create unique index if not exists vans_org_external_unique
  on vans(organisation_id, external_id) where external_id is not null;

-- Existing rows were all created by hand in Shopbook — mark them manual + edited so
-- a future import can't overwrite them.
update vans set imported_from = 'manual', manually_edited = true
where imported_from is distinct from 'mechanic_desk';
