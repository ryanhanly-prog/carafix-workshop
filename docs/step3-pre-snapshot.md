# Step 3 — Pre-change snapshot

Captured 2026-05-27 via Supabase MCP against project `uckshjquyupolwwglacm` (Carafix,
ap-southeast-2, ACTIVE_HEALTHY), **before** any Step 3 migration ran. This is the record
of "what existed before" so the multi-tenancy rewrite in Block C can be reasoned about and
rolled back if needed.

> ⚠️ **TODO / USER ACTION (Block A5):** Take a Supabase point-in-time snapshot from the
> dashboard *before* the multi-tenancy migration (Block C) runs.
>
> **Status for this run:** User confirmed the automatic backup from **26 May 2026 17:44 UTC**
> exists and is the agreed rollback point. Treated as "snapshot taken" — Block C proceeds
> without a further confirmation wait.

## A1. Migrations present (remote, via `list_migrations`)

| # | name |
|---|------|
| 0001 | init |
| 0002 | job_category_fields |
| 0003 | job_number_sequence |
| 0004 | rls_policies |
| 0005 | technician_role |
| 0006 | seed_demo_data |
| 0007 | security_hardening |
| 0008 | status_flow_v2 |
| 0009 | field_renames |
| 0010 | rollup_flags |
| 0011 | demo_data_refresh |

No 0006/0007 gap — they are present. **Next free migration number: `0012`.**

Step 3 will add: `0012_import_schema`, `0013_multi_tenancy`, `0014_add_external_id_to_customers`.

## A2. Current data state

| table | count |
|-------|-------|
| jobs | 10 |
| customers | 10 |
| app_users | 1 (controller) |
| locations | 2 (Arundel, Currumbin) |
| technicians | 7 |
| vans | 10 |

Matches expectations (10 jobs; 1 controller user). Customers is 10 (prompt said "8-ish") —
within tolerance, demo data was refreshed in 0011.

## A3. Tables in `public` (17)

```
ai_briefings, app_config, app_users, bays, customers, holidays, job_attachments,
job_status_log, jobs, locations, parts, promise_date_log, skills, tasks,
technician_skills, technicians, vans
```

Views (4): `v_job_rollup`, `v_skill_daily_demand`, `v_tech_daily_load`,
`v_tech_weekly_utilisation`. All are `security_invoker = true` (set in 0007), so they respect
the querying user's RLS — they will automatically scope by org once the underlying tables are
org-scoped, with no view change required for correctness.

## A4. Current RLS pattern (the shape being replaced in Block C)

`app_users` has **no `email` column** — columns are `id, full_name, role, default_location_id,
created_at`. Auth identity lives in `auth.users`; `app_users.id` = `auth.users.id`.

The existing model is **role-gated, not org-gated**. A `SECURITY DEFINER` helper
`is_controller()` checks `app_users.role = 'controller'` for `auth.uid()` (it is SECURITY
DEFINER specifically so reading `app_users` inside a policy does not recurse through
`app_users`' own RLS — the same trick Block C's `current_user_org_id()` will use).

Policies by table:

| table | policy | cmd | using / with_check |
|-------|--------|-----|--------------------|
| jobs | jobs_controller_all | ALL | `is_controller()` |
| tasks | tasks_controller_all | ALL | `is_controller()` |
| parts | parts_controller_all | ALL | `is_controller()` |
| customers | customers_controller_select/insert/update | S/I/U | `is_controller()` |
| vans | vans_controller_select/insert/update | S/I/U | `is_controller()` |
| technicians | technicians_controller_all | ALL | `is_controller()` |
| technicians | technicians_self_select | SELECT | `auth_user_id = auth.uid()` |
| technician_skills | technician_skills_controller_all | ALL | `is_controller()` |
| ai_briefings | ai_briefings_controller_all | ALL | `is_controller()` |
| job_attachments | job_attachments_controller_all | ALL | `is_controller()` |
| job_status_log | job_status_log_controller_all | ALL | `is_controller()` |
| promise_date_log | promise_date_log_controller_all | ALL | `is_controller()` |
| app_users | app_users_self_select | SELECT | `id = auth.uid()` |
| locations | locations_auth_read | SELECT | `true` |
| skills | skills_auth_read | SELECT | `true` |
| bays | bays_auth_read | SELECT | `true` |
| holidays | holidays_auth_read | SELECT | `true` |
| app_config | app_config_auth_read | SELECT | `true` |

**auth.uid() → user → role flow today:** request carries the Supabase JWT → `auth.uid()`
returns the user's UUID → `is_controller()` (SECURITY DEFINER) reads `app_users.role` for that
UUID → policy allows ALL access for controllers across every location. Per-location filtering
is done in app queries via `LocationContext`, NOT in RLS.

## Block C will replace this with:

- New `current_user_org_id()` (`SECURITY DEFINER`, `stable`, `search_path = public, auth`)
  reading `app_users.organisation_id` for `auth.uid()`.
- Every business table gets `organisation_id` + org-scoped select/insert/update/delete policies
  `organisation_id = current_user_org_id()`.
- `app_users` keeps a non-recursive self-select (`id = auth.uid()`) plus an org-members select
  that uses the SECURITY DEFINER helper (NOT an inline `app_users` subquery, which would
  trigger Postgres "infinite recursion detected in policy" — see judgement notes in summary).
- `is_controller()` is retained (harmless; may be reused for an admin/role split in a later step).

### Tables NOT getting `organisation_id` (judgement call)

- `skills`, `app_config` — treated as shared platform reference/config data; keep `auth read`
  policies.
- `technician_skills` — junction with no natural org column; org-scoped via a join to
  `technicians` (same approach as `stock_item_suppliers`).
