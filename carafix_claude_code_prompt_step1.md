# Carafix Workshop Scheduler — Claude Code Kickoff Prompt

Paste this into a fresh Claude Code session in an empty directory.

---

I want you to scaffold a new internal workshop scheduling app for my caravan repair business, Carafix. Two locations to start (Arundel and Currumbin), designed to add more.

## Important architectural note

In v1, **one technician owns one job** — this matches how the workshop operates 90% of the time. The schema includes a `tasks` table and supporting views because v1.5 will introduce multi-task jobs, but in v1 the UI never shows tasks. A database trigger auto-creates and maintains a single hidden task per job. All scheduling math, capacity views, and skill-demand forecasts run off that tasks table so the multi-task upgrade is a UI change, not a data migration.

Treat jobs as the atomic unit everywhere in the UI for v1.

## Stack (use exactly this — do not substitute)

- Next.js 14, App Router, TypeScript, strict mode
- Tailwind CSS + shadcn/ui (initialise shadcn during setup)
- Supabase (Postgres, Auth, Storage, Realtime) — use the Supabase MCP server I have connected
- TanStack Query for data fetching
- dnd-kit for drag-and-drop (install but don't use yet)
- date-fns + date-fns-business-days for working-day math
- Zod for schema validation
- Server actions for mutations where simple; route handlers for anything complex

## What to build in THIS session (call it Step 1 of the build plan)

Just the scaffold + auth + schema + seed data + an empty shell. No business UI yet.

### Tasks for this session

1. **Initialise the Next.js project** in the current directory with TS, Tailwind, App Router, ESLint, src/ directory, and import alias `@/*`.

2. **Install dependencies**: `@supabase/supabase-js`, `@supabase/ssr`, `@tanstack/react-query`, `@dnd-kit/core`, `@dnd-kit/sortable`, `date-fns`, `date-fns-business-days`, `zod`, `lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority`.

3. **Initialise shadcn/ui** with the Slate base colour. Add these components to start: `button`, `card`, `input`, `label`, `select`, `dialog`, `badge`, `dropdown-menu`, `table`, `tabs`, `toast`, `tooltip`, `separator`, `avatar`, `popover`, `calendar`, `command`.

4. **Set up Supabase**:
   - Use the Supabase MCP to create a new project named `carafix-workshop` (ask me to confirm the org if multiple) OR connect to an existing one if I say so.
   - Apply the migration I'll paste in below as `supabase/migrations/0001_init.sql`.
   - Generate TypeScript types from the schema into `src/lib/database.types.ts`.
   - Create `src/lib/supabase/client.ts` (browser), `src/lib/supabase/server.ts` (server components), and `src/lib/supabase/middleware.ts` (session refresh) following the standard `@supabase/ssr` pattern.
   - Add `.env.local.example` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `ANTHROPIC_API_KEY` (for the AI briefing later).

5. **Auth**: email/password login via Supabase. Build:
   - `/login` page (centred card, email + password, error toasts)
   - Middleware that redirects unauthenticated users to `/login` for any route except `/login` itself
   - After login, redirect to `/`
   - A logout action in the top nav

6. **App shell** at `/` (authenticated):
   - Top bar with: Carafix logo (just text "Carafix Workshop" for now), location switcher (dropdown showing Arundel / Currumbin, persists choice to localStorage), user menu (avatar with email, logout)
   - Left nav with these items (icons from lucide-react), each routing to a stub page that just shows the page title:
     - Schedule (`/schedule`)
     - Kanban (`/kanban`)
     - Jobs (`/jobs`)
     - Technicians (`/technicians`)
     - Parts (`/parts`)
     - Briefing (`/briefing`)
     - Settings (`/settings`)
   - Mobile-responsive: nav collapses to a hamburger sheet on small screens
   - The current location must be available via a React context (`LocationContext`) consumed throughout the app

7. **Seed an initial controller user**: create a Supabase auth user `controller@carafix.local` with password `changeme123` and insert a matching row in `app_users` with role `controller` and `default_location_id` = Arundel. Tell me to change the password on first login.

8. **README.md**: short, covering local dev setup, env vars, how to run migrations, and what's built so far.

9. **Commit**: initial commit with a clear message.

## Schema migration

Save this as `supabase/migrations/0001_init.sql` and apply it via the Supabase MCP:

```sql
[PASTE THE FULL CONTENTS OF carafix_schema.sql HERE]
```

## Style and quality rules

- TypeScript strict, no `any`
- Server components by default; `'use client'` only when needed
- All forms use shadcn `<Form>` + Zod resolver
- Errors surface via shadcn `toast`
- Tailwind classes; no inline styles
- File and folder names kebab-case; React components PascalCase
- No business logic in this session beyond what's listed — resist scope creep, we'll add features in subsequent prompts

## What I do NOT want yet (later sessions)

- Job/task/parts CRUD UI
- Schedule grid
- Kanban
- Mobile tech view
- AI briefing
- CSV import
- Any drag-and-drop logic

## When you're done

Show me:
1. The Supabase project URL and anon key (so I can put them in `.env.local`)
2. A summary of what was built
3. The exact next prompt I should run for Step 2 (which will be: Jobs CRUD + Job Detail modal with tasks + parts sub-tables)

Ask me any questions before starting if anything is ambiguous. Otherwise, begin.
