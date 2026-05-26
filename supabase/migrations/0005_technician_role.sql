-- Simplified display-level role for v1. The granular skills / technician_skills
-- tables are preserved untouched for v1.5; v1 logic ignores them entirely
-- (either role can take any job; the controller picks who they want).

create type tech_role as enum ('Service Tech', 'Caravan Repairer');

alter table technicians
  add column role tech_role;
