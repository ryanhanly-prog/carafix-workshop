# Shopbook Step 3.5 — Supplier contacts + dashboard status visibility + polish

Small, focused step. Three things from real user feedback after running Step 3 on real Carafix data.

## Mode and approach

Use **Claude Opus 4.7** in **auto mode**. Run end-to-end without checkpoints. This is a short, low-risk step — show a brief plan and proceed straight to implementation.

Commit after each block.

---

## Block A — Supplier contacts (the workshop owner's #1 ask)

Context: she loved seeing 181 real suppliers in Shopbook, but said "if we could see phone numbers / contact details, we could order parts straight from this screen." Right now the `suppliers` table only stores name. Add the missing fields.

### A1. Schema migration

Migration `0017_supplier_contacts.sql`:

```sql
alter table suppliers add column if not exists phone text;
alter table suppliers add column if not exists email text;
alter table suppliers add column if not exists website text;
alter table suppliers add column if not exists account_number text;     -- our account # with this supplier
alter table suppliers add column if not exists primary_contact_name text;
alter table suppliers add column if not exists address text;
alter table suppliers add column if not exists payment_terms text;       -- "Net 30", "COD", "2/10 Net 30"
alter table suppliers add column if not exists notes text;
alter table suppliers add column if not exists updated_at timestamptz default now();

-- Update trigger for updated_at
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists trg_suppliers_updated_at on suppliers;
create trigger trg_suppliers_updated_at
  before update on suppliers
  for each row execute function set_updated_at();
```

If `set_updated_at` already exists from a previous migration, skip recreating it — just attach the trigger.

### A2. Suppliers list page — add columns

`/parts/suppliers` currently shows: Supplier name, # Items.

Add visible columns:
- **Phone** (with a `tel:` link)
- **Email** (with a `mailto:` link)
- **Items count** (existing, keep)
- **Last order** (max `last_purchase_date` across their stock items, existing — keep if present)

Make the row clickable to open a detail drawer (see A3). Don't change the existing supplier→catalogue filter behaviour — clicking the supplier *name* still filters, but clicking elsewhere on the row opens the drawer.

Actually simpler: add an **"Edit"** icon button at the end of each row. Click → drawer opens. Clicking the supplier name keeps existing filter behaviour.

### A3. Supplier detail drawer (editable)

A right-side drawer (use the same shadcn `Sheet` pattern as the parts catalogue drawer).

Fields shown and editable:
- Name (required, locked from edit if it came from Mechanic Desk — show a small note "Imported from Mechanic Desk")
- Primary contact name
- Phone (with `tel:` link preview)
- Email (with `mailto:` link preview)
- Website (with link preview)
- Address (multi-line)
- Account number
- Payment terms (free text, with placeholder examples "Net 30", "COD", etc.)
- Notes (multi-line)

Below the form, a read-only summary:
- "Supplies X stock items" with link to catalogue filtered by this supplier
- "Last purchase: [date or '—']"

Save button persists changes. Use a server action with proper org scoping (writes go through RLS).

### A4. Quick-add new supplier

Add a **"+ New supplier"** button at the top of the Suppliers tab. Opens the same drawer in create mode. Required: name only. Useful for adding suppliers Carafix uses but haven't bought from through Mechanic Desk yet (occasional, one-off).

### A5. Don't break the import

The Mechanic Desk import currently upserts suppliers on `(organisation_id, name)` — only updating the `name` field (it's all we had). Update the import logic so:

- If supplier already exists with the same name, **don't overwrite** manually-entered contact fields (phone, email, etc.). The import should only update `name` itself (which is the match key anyway, so this is a no-op) and let the user-added fields persist.

Test: import the sample ZIP, manually edit Camec's phone number, re-import the same ZIP, confirm Camec's phone number is preserved.

### A6. Commit

`Step 3.5a: supplier contact fields + edit drawer + add-supplier flow`

---

## Block B — Dashboard "In progress today" status visibility

Context: Job 100007 is On Hold, but in the dashboard widget it shows Shane's green tech-colour dot, making it look like an actively-progressing job. The widget intentionally includes Arrived + In Progress + On Hold jobs (so it's "what's in the workshop right now") — but right now there's no visual signal which is which.

### B1. Add status badge next to each job in the widget

Update the `InProgressToday` dashboard widget. For each job row, alongside the existing tech dot + tech name + day progress, show a small status badge:

- "Arrived" → amber background (matches existing Arrived status badge colour from Step 2.5)
- "In Progress" → blue (existing colour) — could be omitted since it's the implied default, but keep for clarity
- "On Hold" → orange (existing colour) — **with a small hold-reason snippet if present**, e.g. "On Hold · parts"

Layout:
```
100007  Mibus              Shane  Day 3 of 7   [On Hold · parts]
```

Use the existing status badge component if one already exists — don't reinvent. If not, create a small inline `<StatusBadge size="sm" />` for use in dense lists.

### B2. Don't change the widget's filtering

The widget continues to show jobs with status IN (Arrived, In Progress, On Hold). The fix is purely visual — explicit labels so the user knows which one each job is in.

### B3. Same fix in the Jobs list

The Jobs list already shows Status as a column (verified in Step 2.5 screenshots). No change needed there. This block is dashboard-widget-only.

### B4. Commit

`Step 3.5b: status badges in In-Progress-today dashboard widget`

---

## Block C — Small polish pass

A few minor things noticed during testing. Do these only if there's time and they're low-risk. Otherwise skip and flag in the summary.

### C1. Imports page — better file-name display

Currently shows `export-15186-26_05_2026-22-05.zip` (the raw Mechanic Desk filename). Replace with a human-readable summary: parse the file list inside the batch's `files_uploaded` array and show e.g. "Stocks.csv, 5,435 rows" — pulling from the `stats` jsonb.

Fallback: if `stats` is missing or doesn't parse, show the filename.

### C2. Parts catalogue — fix the supplier-filter chip overflow

The screenshot of `/parts/catalogue` with the "Supplier: Aussie Traveller Pty Ltd ×" chip showed the table appearing to overflow horizontally on the right. Investigate and constrain — likely the table needs `overflow-x-auto` or the chip should wrap.

### C3. Parts catalogue — pluralise the "Used in jobs" count

Currently reads "1 historical invoice line item(s)". Fix the `(s)` pluralisation: "1 historical invoice line item" / "2 historical invoice line items".

### C4. Don't touch anything else

Specifically: don't refactor data fetching, don't change RLS, don't restructure components, don't add features not in this prompt. Step 3.5 is small fixes only.

### C5. Commit

`Step 3.5c: imports filename display + filter chip + pluralisation`

---

## Block D — Verify and push

### D1. Build

```bash
npm run build
```

Must succeed. Fix any TypeScript errors caused by the new supplier columns.

### D2. Regenerate types if needed

```bash
npx supabase gen types typescript --project-id uckshjquyupolwwglacm > src/lib/database.types.ts
```

Only if the new supplier columns aren't picked up automatically.

### D3. Quick smoke test via MCP

```sql
-- New supplier columns exist
select column_name from information_schema.columns 
  where table_name = 'suppliers' and column_name in ('phone', 'email', 'website', 'account_number');
-- Expect 4 rows

-- Existing supplier data preserved
select count(*) from suppliers;
-- Expect 181 (or whatever Step 3 ended at)

-- Verify the trigger is attached
select trigger_name from information_schema.triggers where event_object_table = 'suppliers';
-- Expect trg_suppliers_updated_at
```

### D4. Push

```bash
git push origin main
```

If the safety classifier blocks the push (it has before), commit cleanly locally and tell the user to push manually.

### D5. Final summary

In your final message:
- What got built per block
- Migration numbers used (should be 0017)
- Any TODOs or skipped items from Block C
- Suggested Step 4 scope reminder: AI-assisted quoting, designed after observing James actually quote a job

---

## Out of scope

- AI quoting (Step 4)
- Two-way Mechanic Desk sync (later — investigate MD's import API/screen)
- Supplier-side bulk import (later)
- Adding fields to stock items (later)
- Anything touching the schedule grid, Kanban, mobile views

## Critical reminders

1. **Don't overwrite user-entered supplier contact fields on re-import.** The import should preserve phone/email/etc. that the user has added manually.
2. **Don't change RLS or org-scoping.** Step 3's multi-tenancy is locked in — Step 3.5 is fields and UI only.
3. **Keep it small.** If you find yourself wanting to refactor something, stop. This step is targeted fixes.

Show the plan briefly, then run end-to-end.
