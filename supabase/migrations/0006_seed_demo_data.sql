-- Demo data for development: technicians, bays, customers, vans, and 8 jobs
-- spread across both locations with a mix of statuses and categories so the
-- later schedule/kanban views have something to render. Dates are relative to
-- current_date so the delayed / pickup-ready flags stay meaningful over time.

do $$
declare
  arundel uuid;
  currumbin uuid;
  t_will uuid; t_steve uuid; t_leon uuid; t_shane uuid; t_rob uuid; t_ashley uuid; t_luke uuid;
  bay_ar uuid; bay_cur uuid;
  c uuid; v uuid; j uuid;
begin
  select id into arundel from locations where name = 'Arundel';
  select id into currumbin from locations where name = 'Currumbin';

  -- ---------- Technicians ----------
  insert into technicians (location_id, name, email, role, productive_hours_per_day, weekly_capacity_hours, colour, active)
    values (arundel, 'Will', 'will@carafix.local', 'Service Tech', 6.5, 32.5, '#ef4444', true) returning id into t_will;
  insert into technicians (location_id, name, email, role, productive_hours_per_day, weekly_capacity_hours, colour, active)
    values (arundel, 'Steve', 'steve@carafix.local', 'Caravan Repairer', 6.5, 32.5, '#f97316', true) returning id into t_steve;
  insert into technicians (location_id, name, email, role, productive_hours_per_day, weekly_capacity_hours, colour, active)
    values (arundel, 'Leon', 'leon@carafix.local', 'Caravan Repairer', 6.5, 32.5, '#eab308', true) returning id into t_leon;
  insert into technicians (location_id, name, email, role, productive_hours_per_day, weekly_capacity_hours, colour, active)
    values (arundel, 'Shane', 'shane@carafix.local', 'Caravan Repairer', 6.5, 32.5, '#22c55e', true) returning id into t_shane;
  insert into technicians (location_id, name, email, role, productive_hours_per_day, weekly_capacity_hours, colour, active)
    values (arundel, 'Rob', 'rob@carafix.local', 'Caravan Repairer', 6.5, 32.5, '#06b6d4', true) returning id into t_rob;
  insert into technicians (location_id, name, email, role, productive_hours_per_day, weekly_capacity_hours, colour, active)
    values (currumbin, 'Ashley', 'ashley@carafix.local', 'Caravan Repairer', 6.5, 32.5, '#3b82f6', true) returning id into t_ashley;
  insert into technicians (location_id, name, email, role, productive_hours_per_day, weekly_capacity_hours, colour, active)
    values (currumbin, 'Luke', 'luke@carafix.local', 'Service Tech', 6.5, 32.5, '#a855f7', true) returning id into t_luke;

  -- ---------- Bays: 4 drive-in + 4 yard per location ----------
  insert into bays (location_id, name, type)
  select l.id, b.name, b.type::bay_type
  from locations l
  cross join (values
    ('Bay 1','Drive-in Bay'), ('Bay 2','Drive-in Bay'), ('Bay 3','Drive-in Bay'), ('Bay 4','Drive-in Bay'),
    ('Yard A','Yard Slot'), ('Yard B','Yard Slot'), ('Yard C','Yard Slot'), ('Yard D','Yard Slot')
  ) as b(name, type)
  where l.name in ('Arundel', 'Currumbin');

  select id into bay_ar from bays where location_id = arundel and name = 'Bay 1';
  select id into bay_cur from bays where location_id = currumbin and name = 'Bay 1';

  -- ---------- Jobs ----------

  -- 1: Arundel, Insurance, Booked In
  insert into customers (name, phone, email) values ('Margaret Whitlam','0412 345 678','margaret.whitlam@example.com') returning id into c;
  insert into vans (customer_id, make, model, year, rego) values (c,'Jayco','Starcraft',2019,'041QFK') returning id into v;
  insert into jobs (location_id, van_id, customer_id, category, priority, status, description, work_type, quoted_hours, assigned_tech_id, booked_in_date, planned_start_date, expected_finish_date, invoice_status, insurance_claim_number)
    values (arundel, v, c, 'Insurance','Normal','Booked In','Hail damage to roof and front panel; insurer assessment booked.','Repair',12,t_steve, current_date, current_date+2, current_date+5,'Not Invoiced','INS-88231');

  -- 2: Currumbin, Private, Booked In
  insert into customers (name, phone, email) values ('Bruce Camilleri','0419 776 220','bruce.camilleri@example.com') returning id into c;
  insert into vans (customer_id, make, model, year, rego) values (c,'Coromal','Appeal',2017,'882RTV') returning id into v;
  insert into jobs (location_id, van_id, customer_id, category, priority, status, description, work_type, quoted_hours, assigned_tech_id, booked_in_date, planned_start_date, expected_finish_date, invoice_status)
    values (currumbin, v, c, 'Private','Normal','Booked In','Annual service plus wheel bearing repack.','Service',8,t_luke, current_date, current_date+3, current_date+6,'Not Invoiced');

  -- 3: Arundel, Warranty, Waiting to Start
  insert into customers (name, phone, email) values ('Dawn Fitzgerald','0438 110 993','dawn.fitzgerald@example.com') returning id into c;
  insert into vans (customer_id, make, model, year, rego) values (c,'New Age','Manta Ray',2021,'613ASU') returning id into v;
  insert into jobs (location_id, van_id, customer_id, category, priority, status, description, work_type, quoted_hours, assigned_tech_id, booked_in_date, planned_start_date, expected_finish_date, invoice_status, warranty_reference)
    values (arundel, v, c, 'Warranty','High','Waiting to Start','Warranty claim: delamination on offside wall.','Repair',16,t_leon, current_date, current_date+1, current_date+4,'Not Invoiced','Chassis SN-6T9C12345');

  -- 4: Currumbin, Private, Waiting to Start
  insert into customers (name, phone, email) values ('Trevor Nguyen','0401 552 778','trevor.nguyen@example.com') returning id into c;
  insert into vans (customer_id, make, model, year, rego) values (c,'Avida','Emerald',2018,'774KWP') returning id into v;
  insert into jobs (location_id, van_id, customer_id, category, priority, status, description, work_type, quoted_hours, assigned_tech_id, booked_in_date, planned_start_date, expected_finish_date, invoice_status)
    values (currumbin, v, c, 'Private','Low','Waiting to Start','Pre-purchase inspection for prospective buyer.','Pre-purchase inspection',6,t_ashley, current_date, current_date+4, current_date+8,'Not Invoiced');

  -- 5: Arundel, Private, In Progress (OVERDUE)
  insert into customers (name, phone, email) values ('Janelle Hargreaves','0455 309 112','janelle.hargreaves@example.com') returning id into c;
  insert into vans (customer_id, make, model, year, rego) values (c,'Lotus','Trooper',2020,'209MHD') returning id into v;
  insert into jobs (location_id, van_id, customer_id, bay_id, category, priority, status, description, work_type, quoted_hours, assigned_tech_id, booked_in_date, planned_start_date, expected_finish_date, invoice_status)
    values (arundel, v, c, bay_ar, 'Private','Urgent','In Progress','Full chassis and suspension overhaul; running long.','Repair',20,t_will, current_date-9, current_date-7, current_date-1,'Not Invoiced');

  -- 6: Currumbin, Dealer, In Progress
  insert into customers (name, phone, email) values ('Wayne Petersen','0427 884 661','wayne.petersen@example.com') returning id into c;
  insert into vans (customer_id, make, model, year, rego) values (c,'Jayco','Silverline',2022,'556PLQ') returning id into v;
  insert into jobs (location_id, van_id, customer_id, bay_id, category, priority, status, description, work_type, quoted_hours, assigned_tech_id, booked_in_date, planned_start_date, expected_finish_date, invoice_status)
    values (currumbin, v, c, bay_cur, 'Dealer','Normal','In Progress','Dealer pre-delivery: fit solar, inverter and lithium upgrade.','Modification',10,t_ashley, current_date-2, current_date-1, current_date+3,'Draft');

  -- 7: Arundel, Waiting on Parts (2 parts: one received, one ETA next week)
  insert into customers (name, phone, email) values ('Coral Mibus','0413 220 558','coral.mibus@example.com') returning id into c;
  insert into vans (customer_id, make, model, year, rego) values (c,'New Age','Big Red',2016,'318ZCN') returning id into v;
  insert into jobs (location_id, van_id, customer_id, bay_id, category, priority, status, description, work_type, quoted_hours, assigned_tech_id, booked_in_date, planned_start_date, expected_finish_date, invoice_status)
    values (arundel, v, c, bay_ar, 'Private','Normal','Waiting on Parts','Replace fridge cooling unit and hot water anode.','Repair',25,t_shane, current_date-3, current_date, current_date+7,'Not Invoiced') returning id into j;
  insert into parts (job_id, description, supplier, quantity, is_critical, status, ordered_date, received_date, cost)
    values (j,'Suburban hot water anode','RV Parts Direct',1,true,'Received',current_date-5,current_date-1,45);
  insert into parts (job_id, description, supplier, quantity, is_critical, status, ordered_date, eta_date, cost)
    values (j,'Dometic fridge cooling unit','Coastal RV',1,true,'Ordered',current_date-2,current_date+7,890);

  -- 8: Arundel, QA Check + invoice Complete -> pickup ready
  insert into customers (name, phone, email) values ('Gary Polson','0466 771 304','gary.polson@example.com') returning id into c;
  insert into vans (customer_id, make, model, year, rego) values (c,'Coromal','Pioneer',2015,'190TBW') returning id into v;
  insert into jobs (location_id, van_id, customer_id, category, priority, status, description, work_type, quoted_hours, assigned_tech_id, booked_in_date, planned_start_date, expected_finish_date, actual_finish_date, invoice_status)
    values (arundel, v, c, 'Private','Normal','QA Check','Gas compliance and brake service complete; final QA.','Service',5,t_rob, current_date-5, current_date-3, current_date+1, current_date, 'Complete') returning id into j;
  -- The hidden primary task is auto-created by the sync trigger; mark it done so is_pickup_ready fires.
  update tasks set status = 'Done', completed_at = now() where job_id = j;
end $$;
