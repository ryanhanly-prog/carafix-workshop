# Step 3.5 summary — Supplier contacts, dashboard status, polish

Completed 2026-05-27. Project `uckshjquyupolwwglacm`. `npm run build` passes,
`tsc --noEmit` clean. Migration: **0017** only. No RLS / multi-tenancy changes.

## A — Supplier contacts
- `0017_supplier_contacts.sql`: added `phone, email, website, account_number,
  primary_contact_name, address, payment_terms, notes, updated_at` to `suppliers`
  + `set_updated_at()` trigger. Dropped the unused, empty `contact_phone` /
  `contact_email` columns from 0012 (verified 0/181 populated) to avoid duplicate
  phone/email fields.
- `/parts/suppliers`: Phone (`tel:`) and Email (`mailto:`) columns; per-row Edit
  button; editable `Sheet` drawer; "+ New supplier". Supplier-name click still
  filters the catalogue. Imported suppliers (those with stock links) keep a locked
  name so a rename can't cause a duplicate on re-import.
- New `suppliers` server action (create/update), org-scoped through RLS.
- **Import preservation:** supplier upsert now DO-NOTHING-on-conflict, so manual
  contact fields survive re-import. Verified: set Camec's phone + contact, re-ran
  the full import, both persisted; 181 suppliers unchanged.

## B — Dashboard "In progress today" status visibility
- Each row now shows its status badge (Arrived / In Progress / On Hold) next to the
  tech dot + day progress, with a hold-reason snippet ("On Hold · <reason>"). The
  widget still includes Arrived + In Progress + On Hold — fix is purely visual.

## C — Polish
- Imports history shows a human summary from `stats` ("5,287 stock · 3,513
  customers · 181 suppliers · 41 invoices"), falling back to file names.
- Catalogue table wrapped in `overflow-x-auto` — the supplier-filter chip no longer
  makes it spill horizontally.
- "Used in jobs" count pluralises correctly (1 item / 2 items).

## Skipped / TODO
- None skipped. (C1 summarises by entity rather than literal per-file row counts,
  because `stats` is keyed by entity, not by CSV file — more useful, and the file
  names remain as the fallback.)

## Judgement calls
- Dropped vestigial `contact_phone`/`contact_email` (empty, unreferenced) instead
  of leaving them beside the new `phone`/`email`.
- "Imported" detection for the name lock uses `item_count > 0` (no source flag on
  suppliers); manual suppliers have editable names.
- Suppliers list drops the Step-3 "Avg Markup" column in favour of Phone/Email per
  the Step 3.5 target column set.

## Next: Step 4
AI-assisted quoting — designed after observing James actually quote a job. The
stock catalogue (sell/buy/margin) + historical quotes/invoices now provide the
pricing foundation.
