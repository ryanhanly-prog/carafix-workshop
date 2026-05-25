# Carafix Workshop Scheduler

Internal workshop scheduling app for Carafix caravan repairs. Two locations to
start (Arundel and Currumbin), designed to add more.

This repository currently contains **Step 1** of the build plan: project
scaffold, authentication, database schema, seed data, and an empty app shell.
No business UI yet.

## Stack

- Next.js (App Router, TypeScript strict) — scaffolded on the latest release
  (Next 16; "latest" has moved past the 14 named in the original brief)
- Tailwind CSS v4 + shadcn/ui (Slate base colour)
- Supabase (Postgres, Auth, Storage, Realtime)
- TanStack Query for data fetching
- dnd-kit (installed, not used yet)
- date-fns for working-day math (the brief named `date-fns-business-days`, which
  does not exist on npm; date-fns ships `addBusinessDays` / `differenceInBusinessDays`)
- Zod for validation, react-hook-form via shadcn `<Form>`
- sonner for toasts (shadcn's replacement for the deprecated `toast`)

## Local development

```bash
npm install
cp .env.local.example .env.local   # then fill in the values
npm run dev                          # http://localhost:3000
```

Other scripts:

```bash
npm run build   # production build
npm run lint    # eslint
npm start       # serve the production build
```

## Environment variables

Copy `.env.local.example` to `.env.local` and fill in:

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (`sb_publishable_…`), browser-safe |
| `SUPABASE_SECRET_KEY` | Secret key (`sb_secret_…`), server-only |
| `ANTHROPIC_API_KEY` | For the AI briefing feature (a later step) |

Find these in the Supabase dashboard under **Project Settings → API Keys**.

## Database & migrations

The schema lives in `supabase/migrations/0001_init.sql` and has been applied to
the Supabase project named **Carafix**.

To apply migrations to another project, run them through the Supabase MCP
(`apply_migration`) or the Supabase CLI (`supabase db push`).

After a schema change, regenerate the TypeScript types into
`src/lib/database.types.ts` (via the MCP `generate_typescript_types` or the
Supabase CLI `supabase gen types typescript`).

### Architecture note: jobs vs tasks

In v1, **one technician owns one job**. The `tasks` table and the capacity /
skill-demand views exist so that v1.5 can introduce multi-task jobs without a
data migration. A database trigger (`sync_primary_task`) auto-creates and
maintains a single hidden task per job. **The v1 UI treats jobs as the atomic
unit and never shows tasks.** When `app_config.multi_task_enabled` is set to
`true`, the sync trigger no-ops and the UI takes over task management.

## Seeded controller login

A controller account is seeded for first sign-in:

- **Email:** `controller@carafix.local`
- **Password:** `changeme123`

**Change this password on first login.** Its `app_users` row has role
`controller` and default location Arundel.

## Row Level Security

RLS is enabled on `jobs`, `tasks`, `parts`, `technicians`, `app_users`, and
`job_attachments`, but **no policies are defined yet** (per the schema's own
note, policies are added per-environment in a later step). Practical effects in
Step 1:

- The app shell reads the signed-in user from the auth session only, so login
  and navigation work without policies.
- `app_users` cannot yet be read from the client, so the location switcher
  defaults to the first active location rather than the user's saved default.
- Several reference tables (e.g. `locations`, `skills`) have RLS **disabled**,
  which means they are readable/writable by anyone holding the publishable key.
  Lock these down with policies before any production use.

## What's built so far (Step 1)

- Next.js + Tailwind + shadcn/ui scaffold
- Supabase clients for browser, server, and the session-refresh proxy
  (`src/proxy.ts` — Next 16's replacement for `middleware.ts`)
- Email/password auth: `/login`, route gating, logout
- App shell at `/`: top bar (logo, location switcher persisted to localStorage,
  user menu), left nav, mobile hamburger sheet, `LocationContext`
- Stub pages for Schedule, Kanban, Jobs, Technicians, Parts, Briefing, Settings

## Not built yet (later steps)

Job/task/parts CRUD UI, schedule grid, kanban, mobile tech view, AI briefing,
CSV import, drag-and-drop logic.
