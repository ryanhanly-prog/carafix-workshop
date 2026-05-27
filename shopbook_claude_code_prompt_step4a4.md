# Step 4a.4 — Quote Editor Layout Polish

**Context for Claude Code:** Step 4a.3 (vans unification) is complete. Shopbook's quoting wedge is now functionally end-to-end with real Carafix data. Real-data testing surfaced layout issues on the most important screen in the product — `/quotes/[id]/edit`. The line items table is squeezed between the left nav sidebar and the right-hand Totals + Similar Quotes panels. Markup column is cropped, Unit Price and Line Total columns scroll horizontally. James (the primary user) will be staring at this screen for 30-45 min per insurance quote; the layout has to give the line items table room to breathe.

This step rebuilds the editor layout so the table gets ~90% of window width, and refines how the supporting panels behave.

## Goals

1. Auto-collapse the left navigation sidebar to icon-only when on the quote editor route.
2. Move the Totals panel from the right column to a sticky footer beneath the line items table.
3. Convert the Similar Quotes panel from always-visible right column to a collapsible slide-over drawer.

End state: line items table uses the full content width. Totals always visible at the bottom. Similar Quotes accessible on demand without occupying real estate.

## Detailed scope

### 1. Sidebar auto-collapse

Auto-collapse the left navigation to icon-only width on the `/quotes/[id]/edit` route. Keep it expanded on every other route.

- Add a `collapsed` mode to the existing nav sidebar component (probably already supports this for narrower screens — re-use if so).
- Use the route matching pattern (Next.js `usePathname` or whatever existing route-detection mechanism the codebase uses) to drive the state.
- Icons-only width: ~64px. Full-width: whatever it currently is.
- Hovering an icon shows a tooltip with the section name (so James can still navigate without expanding).
- A small "expand sidebar" affordance (chevron icon at top or bottom of the collapsed sidebar) lets the user expand it manually if they want to navigate. Expanding manually overrides the auto-collapse for the rest of the session.

### 2. Totals panel as sticky footer

Currently the Totals box (Parts / Labour / Consumables / Other / Total / Status) lives in the right column. Move it to a sticky footer below the line items table.

- Footer is fixed to the bottom of the editor content area (not the viewport — so it scrolls with the editor but stays visible when the line items table extends below the fold).
- Layout horizontally rather than vertically. Suggested order: Parts $X · Labour $X · Consumables $X · Other $X · **Total $X** · Status dropdown.
- Right-align the Total amount; make it bold and slightly larger than the subtotals.
- The Status dropdown stays in this footer alongside the totals — it's a workflow control that pairs naturally with the running total.
- On narrow viewports (< 1100px), let it wrap to two rows. Don't squeeze it.

### 3. Similar Quotes as slide-over

Currently the Similar Quotes panel occupies the right column permanently. Convert it to a slide-over drawer:

- A button in the editor header (or floating at top-right of the line items area) labelled "Similar quotes (N)" where N is the count of matches.
- Clicking the button opens a right-side drawer (~400-450px wide) overlaying the editor.
- Drawer contains the existing SimilarQuotesPanel content (card per match with score, preview, badges, shape line, clone button).
- Clicking outside the drawer or hitting Escape closes it.
- Cloning a quote closes the drawer automatically after the clone fires.
- **Auto-open behaviour on new draft:** when the quote is freshly created and has zero line items, the drawer is open by default so James sees the matches immediately. After he clones (or dismisses the drawer), it stays closed unless he re-opens via the button.

### 4. Edit dialog from 4a.3 stays where it is

The per-row van edit dialog on the customer detail page is fine as-is. Not affected by this step.

## Self-test

Manual test in the running app (run via Supabase MCP for state setup, then visually verify):

1. Navigate to `/quotes` — sidebar is expanded.
2. Open any quote in edit mode — sidebar auto-collapses to icons.
3. Verify Markup, Unit Price, Line Total columns all visible without horizontal scroll on a 1440px-wide viewport.
4. Verify Totals are visible at the bottom of the editor area.
5. Click "Similar quotes (N)" button — drawer slides in from the right.
6. Pick a result and clone — drawer closes automatically, line items populate.
7. Click button again, dismiss with Escape — drawer closes.
8. Navigate away from quote editor — sidebar re-expands.
9. Create a new quote — drawer is open by default on first render.
10. On a narrow viewport (~900px), confirm totals wrap gracefully and don't break layout.

## Commit boundaries

1. Sidebar collapse logic + icon-only mode + route-aware behaviour
2. Totals footer (extract from right column, restyle as horizontal sticky footer)
3. Similar Quotes slide-over (extract from right column into Drawer/Sheet component, add trigger button, auto-open logic)
4. Cleanup + self-test verification + docs/step4a4-summary.md + push

## Out of scope (explicit — do not build)

- Line item rendering polish (section divider rows for type=other / qty=0 lines, unit defaults by type) — separate concern, bundle later.
- Job type badge name display — separate concern, bundle later.
- Vehicle dropdown richness — separate concern, bundle later.
- Drag-and-drop reordering of line items (current up/down buttons are fine for v1).
- Any change to the line items table structure other than letting it use more width.
- Any change to the new-quote form (`/quotes/new`).

## Open questions to flag in plan

- Does the existing nav sidebar component already support a collapsed mode, or does it need to be added? If the latter, that affects scope estimate.
- Is the customer-detail vans edit dialog from 4a.3 using shadcn's Dialog or a custom modal? Same component pattern should be re-used for any "open in drawer" behaviour here (consistency).
- For the auto-open on new draft, is "zero line items" the right trigger or should it be "this is the user's first visit to this quote" (tracked via localStorage)? Recommendation: zero line items. Simple, fixes itself once they clone or add a line.

## Wrap-up

Write `docs/step4a4-summary.md` covering:
- Before/after screenshots descriptions (Claude Code obviously can't take screenshots but can describe the layout changes)
- Components modified
- Any rough edges
- Items remaining from the backlog file
