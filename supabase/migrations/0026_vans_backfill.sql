-- Step 4a.3: backfill historical_vehicles -> vans, and the reusable sync function
-- the import pipeline calls on every run. Single source of truth.
--
-- Idempotent: ON CONFLICT refreshes imported data but only for rows the user
-- hasn't manually edited. Orphan historical_vehicles (customer_external_id with no
-- matching customer) are skipped by the INNER JOIN. `notes` is set on insert only,
-- never overwritten on refresh.

create or replace function sync_imported_vans(p_org uuid)
returns int language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  insert into vans (
    organisation_id, customer_id, make, model, year, notes, rego,
    chassis_number, vin, fleet_number, vehicle_number,
    external_id, imported_from, imported_at, manually_edited
  )
  select
    hv.organisation_id, c.id, hv.make, hv.model,
    case when hv.year ~ '^\d{4}$' then hv.year::int else null end,
    hv.notes, hv.registration_number,
    hv.chassis_number, hv.vin, hv.fleet_number, hv.vehicle_number,
    hv.external_id, 'mechanic_desk', hv.imported_at, false
  from historical_vehicles hv
  join customers c
    on c.organisation_id = hv.organisation_id
   and c.external_id = hv.customer_external_id
  where hv.organisation_id = p_org
    and hv.external_id is not null
  on conflict (organisation_id, external_id) where external_id is not null
  do update set
    make = excluded.make,
    model = excluded.model,
    year = excluded.year,
    rego = excluded.rego,
    chassis_number = excluded.chassis_number,
    vin = excluded.vin,
    fleet_number = excluded.fleet_number,
    vehicle_number = excluded.vehicle_number,
    imported_at = excluded.imported_at
  where vans.manually_edited = false;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function sync_imported_vans(uuid) to authenticated;

-- Initial backfill for Carafix.
select sync_imported_vans('00000000-0000-0000-0000-000000000002');
