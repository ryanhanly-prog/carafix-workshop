// Step 4b acceptance self-test. Drives a service-role client at the real DB,
// runs getQuoteForOutput for Q-100001 + Q-100004, renders both customer +
// workshop PDFs through @react-pdf/renderer's renderToBuffer, cross-checks
// derived values against the raw DB rows, and exercises the two edge cases
// (no insurer / no location_id) with throwaway fixtures that are deleted
// before the script exits.
//
//   npx tsx scripts/step4b-selftest.ts

import { readFileSync } from "node:fs"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { createElement, type JSXElementConstructor, type ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer"

import type { Database } from "@/lib/database.types"
import { formatMoney } from "@/lib/format"
import { getQuoteForOutput, isPlaceholderDividerLabel, type QuoteOutputModel } from "@/lib/quote-output"
import { CustomerDocHtml } from "@/components/quotes/output/customer-doc-html"
import { CustomerDocPdf } from "@/components/quotes/output/customer-doc-pdf"
import { WorkshopDocHtml } from "@/components/quotes/output/workshop-doc-html"
import { WorkshopDocPdf } from "@/components/quotes/output/workshop-doc-pdf"

const CARAFIX_ORG = "00000000-0000-0000-0000-000000000002"

function loadEnv() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
    }
  } catch {}
}

let pass = 0
let fail = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    pass++
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ""}`)
  } else {
    fail++
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`)
  }
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

async function renderCustomer(model: QuoteOutputModel): Promise<{ ms: number; bytes: Buffer }> {
  const t0 = performance.now()
  const el = createElement(CustomerDocPdf, { model }) as unknown as ReactElement<DocumentProps>
  const bytes = await renderToBuffer(el)
  return { ms: performance.now() - t0, bytes }
}

async function renderWorkshop(model: QuoteOutputModel): Promise<{ ms: number; bytes: Buffer }> {
  const t0 = performance.now()
  const el = createElement(WorkshopDocPdf, { model }) as unknown as ReactElement<DocumentProps>
  const bytes = await renderToBuffer(el)
  return { ms: performance.now() - t0, bytes }
}

function pdfMagicOk(b: Buffer): boolean {
  return b.subarray(0, 5).toString("ascii") === "%PDF-"
}

// react-pdf compresses content streams, so a rendered PDF buffer is not
// greppable for visible text. Instead we walk the JSX tree the component
// returns when called as a plain function — the components are pure (no
// hooks), so invoking them outside a React renderer is safe. This proves
// the SEMANTIC content (which Text nodes get emitted) without touching
// pdfkit's binary encoding.
type AnyNode = unknown
function pdfTreeContains(node: AnyNode, needle: string): boolean {
  if (node == null || typeof node === "boolean") return false
  if (typeof node === "string" || typeof node === "number") {
    return String(node).includes(needle)
  }
  if (Array.isArray(node)) return node.some((c) => pdfTreeContains(c, needle))
  if (typeof node === "object" && node !== null && "props" in node) {
    const children = (node as { props?: { children?: AnyNode } }).props?.children
    if (children !== undefined) return pdfTreeContains(children, needle)
  }
  return false
}
/**
 * Count text-LEAF nodes (string/number children of a Text element) whose
 * value exactly equals the given string. Used to detect specific divider
 * labels that should/shouldn't appear; intentionally exact-match (not
 * substring) so unrelated text that happens to contain the same word
 * doesn't pollute the count.
 */
function pdfTreeCountExactLeaf(node: AnyNode, exact: string): number {
  if (node == null || typeof node === "boolean") return 0
  if (typeof node === "string" || typeof node === "number") {
    return String(node) === exact ? 1 : 0
  }
  if (Array.isArray(node)) {
    return node.reduce<number>((sum, c) => sum + pdfTreeCountExactLeaf(c, exact), 0)
  }
  if (typeof node === "object" && node !== null && "props" in node) {
    const children = (node as { props?: { children?: AnyNode } }).props?.children
    if (children !== undefined) return pdfTreeCountExactLeaf(children, exact)
  }
  return 0
}

/** Count divider <td> rows in the customer HTML output. Divider <td>s have
 * the unique class signature "border-b border-neutral-200 pb-2 pt-5"; line
 * <tr>s use different borders/padding. */
function countCustomerDividerRows(html: string): number {
  return (html.match(/border-b border-neutral-200 pb-2 pt-5/g) ?? []).length
}
/** Same for the workshop HTML output (different signature: includes px-2). */
function countWorkshopDividerRows(html: string): number {
  return (html.match(/border-b border-neutral-200 px-2 pb-2 pt-5/g) ?? []).length
}
function customerPdfText(model: QuoteOutputModel): unknown {
  // Invoke the component function directly to get its JSX tree.
  return (CustomerDocPdf as unknown as (p: { model: QuoteOutputModel }) => unknown)({ model })
}
function workshopPdfText(model: QuoteOutputModel): unknown {
  return (WorkshopDocPdf as unknown as (p: { model: QuoteOutputModel }) => unknown)({ model })
}

// Render an HTML component to a static markup string for substring assertions.
// CustomerDocHtml and WorkshopDocHtml are pure server components.
type AnyComponent = (props: { model: QuoteOutputModel }) => unknown
function renderHtml(Component: AnyComponent, model: QuoteOutputModel): string {
  // createElement accepts our pure-component function; the React types are
  // strict on ReactNode return, so a small cast keeps the call typed.
  const el = createElement(
    Component as unknown as JSXElementConstructor<{ model: QuoteOutputModel }>,
    { model },
  ) as unknown as ReactElement
  return renderToStaticMarkup(el)
}

async function main() {
  loadEnv()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY")
  const db: SupabaseClient<Database> = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const started = Date.now()
  console.log("Step 4b acceptance self-test\n")

  // -------------------------------------------------------------------------
  // 1. Q-100001 — customer view fixture (Arundel, has insurer, has dividers,
  // has labour lines). Verify the model assembles correctly and the customer
  // PDF reflects DB-stored totals exactly.
  // -------------------------------------------------------------------------
  console.log("Q-100001 (Arundel, with insurer)")
  const { data: q1Row } = await db
    .from("quotes")
    .select("id, total, subtotal_parts, subtotal_labour, subtotal_consumables, subtotal_other, location_id, insurer_id")
    .eq("quote_number", "Q-100001")
    .single()
  if (!q1Row) throw new Error("Q-100001 not found")

  const model1 = await getQuoteForOutput(db, q1Row.id)
  check("model1 returned", !!model1)
  if (!model1) throw new Error("model1 null — abort")

  check(
    "total matches quotes.total",
    round2(model1.totals.total ?? -1) === round2(Number(q1Row.total)),
    `model=${model1.totals.total} db=${q1Row.total}`,
  )
  check(
    "subtotals match stored columns",
    round2(model1.totals.parts ?? 0) === round2(Number(q1Row.subtotal_parts ?? 0)) &&
      round2(model1.totals.labour ?? 0) === round2(Number(q1Row.subtotal_labour ?? 0)) &&
      round2(model1.totals.consumables ?? 0) === round2(Number(q1Row.subtotal_consumables ?? 0)) &&
      round2(model1.totals.other ?? 0) === round2(Number(q1Row.subtotal_other ?? 0)),
  )

  // Workshop branding — name+ABN from org, address/phone/email from Arundel location.
  check("workshop.name = 'Carafix Caravan Repairs'", model1.workshop.name === "Carafix Caravan Repairs")
  check("workshop.abn = '66663914154'", model1.workshop.abn === "66663914154")
  check(
    "workshop.address = Arundel address",
    model1.workshop.address === "15 Technology Dr, Arundel QLD 4214",
    `got "${model1.workshop.address}"`,
  )
  check("workshop.phone = Arundel phone", model1.workshop.phone === "(07) 5571 5018")
  check("workshop.email = Arundel email", model1.workshop.email === "info@carafix.com.au")
  check("workshop.locationName = 'Arundel'", model1.workshop.locationName === "Arundel")
  check("insurer present", model1.insurer !== null)

  // Per-line margin matches (unit_price - unit_cost) * quantity for every
  // non-divider line, cross-checked against the DB rows directly.
  const { data: q1Lines } = await db
    .from("quote_line_items")
    .select("line_order, line_type, quantity, unit_cost, unit_price, line_total")
    .eq("quote_id", q1Row.id)
    .order("line_order")
  const dividerCount = (q1Lines ?? []).filter(
    (l) =>
      l.line_type === "other" &&
      Number(l.quantity ?? 0) === 0 &&
      Number(l.unit_cost ?? 0) === 0 &&
      Number(l.line_total ?? 0) === 0,
  ).length
  const modelDividerCount = model1.lines.filter((l) => l.isDivider).length
  check("divider detection mirrors quote-editor heuristic", dividerCount === modelDividerCount, `db=${dividerCount} model=${modelDividerCount}`)

  let lineMarginOk = true
  for (let i = 0; i < model1.lines.length; i++) {
    const ml = model1.lines[i]
    if (ml.isDivider) continue
    const expected = round2(
      (Number(ml.unitPrice ?? 0) - Number(ml.unitCost ?? 0)) * Number(ml.quantity ?? 0),
    )
    if (round2(ml.marginDollars) !== expected) {
      lineMarginOk = false
      console.log(
        `      line #${ml.displayNumber}: margin=${ml.marginDollars} expected=${expected} ` +
          `(unit_price=${ml.unitPrice} unit_cost=${ml.unitCost} qty=${ml.quantity})`,
      )
    }
  }
  check("every non-divider line margin = (price-cost)*qty", lineMarginOk)

  // Labour suffix sanity (Q-100001 has two labour lines: 6 hrs & 9.5 hrs at $140.91/hr).
  const labourLines = model1.lines.filter((l) => l.lineType === "labour")
  check(
    "labour suffix appended for both labour lines",
    labourLines.length === 2 && labourLines.every((l) => /hrs @ \$/.test(l.labourSuffix ?? "")),
    labourLines.map((l) => l.labourSuffix).join(" | "),
  )

  // Render customer + workshop PDFs.
  const cust1 = await renderCustomer(model1)
  check("customer PDF magic bytes", pdfMagicOk(cust1.bytes), `${(cust1.bytes.length / 1024).toFixed(1)} KB in ${cust1.ms.toFixed(0)} ms`)
  const wk1 = await renderWorkshop(model1)
  check("workshop PDF magic bytes", pdfMagicOk(wk1.bytes), `${(wk1.bytes.length / 1024).toFixed(1)} KB in ${wk1.ms.toFixed(0)} ms`)

  // -------------------------------------------------------------------------
  // 2. Q-100004 (10 lines — the largest existing quote). Perf budget check.
  // -------------------------------------------------------------------------
  console.log("\nQ-100004 (10 lines, perf budget)")
  const { data: q4Row } = await db
    .from("quotes")
    .select("id, quote_number")
    .eq("quote_number", "Q-100004")
    .single()
  if (!q4Row) throw new Error("Q-100004 not found")

  const model4 = await getQuoteForOutput(db, q4Row.id)
  if (!model4) throw new Error("model4 null")
  check("model4 returned", !!model4, `${model4.lines.length} lines`)

  const cust4 = await renderCustomer(model4)
  const wk4 = await renderWorkshop(model4)
  check("Q-100004 customer PDF magic bytes", pdfMagicOk(cust4.bytes), `${(cust4.bytes.length / 1024).toFixed(1)} KB in ${cust4.ms.toFixed(0)} ms`)
  check("Q-100004 workshop PDF magic bytes", pdfMagicOk(wk4.bytes), `${(wk4.bytes.length / 1024).toFixed(1)} KB in ${wk4.ms.toFixed(0)} ms`)
  // Budget gate (per the user's watch item: 2s target, 3s ceiling).
  check("Q-100004 customer PDF under 2s target", cust4.ms < 2000, `${cust4.ms.toFixed(0)} ms`)
  check("Q-100004 workshop PDF under 2s target", wk4.ms < 2000, `${wk4.ms.toFixed(0)} ms`)
  check("Q-100004 customer PDF under 3s ceiling", cust4.ms < 3000, `${cust4.ms.toFixed(0)} ms`)
  check("Q-100004 workshop PDF under 3s ceiling", wk4.ms < 3000, `${wk4.ms.toFixed(0)} ms`)

  // -------------------------------------------------------------------------
  // 3. No-insurer fixture — temporary quote with insurer_id = NULL.
  // -------------------------------------------------------------------------
  console.log("\nNo-insurer fixture (insurer block must be omitted)")
  const { data: jt } = await db
    .from("job_type_canonical")
    .select("id")
    .eq("organisation_id", CARAFIX_ORG)
    .limit(1)
    .single()
  const { data: arundel } = await db
    .from("locations")
    .select("id")
    .eq("name", "Arundel")
    .single()
  if (!jt || !arundel) throw new Error("missing fixtures (job_type / Arundel)")

  const { data: noInsQ } = await db
    .from("quotes")
    .insert({
      organisation_id: CARAFIX_ORG,
      canonical_job_type_id: jt.id,
      location_id: arundel.id,
      insurer_id: null,
      status: "draft",
      description: "STEP4B-SELFTEST-NO-INSURER",
    })
    .select("id")
    .single()
  if (!noInsQ) throw new Error("could not insert no-insurer fixture")
  try {
    await db.from("quote_line_items").insert({
      organisation_id: CARAFIX_ORG,
      quote_id: noInsQ.id,
      line_order: 1,
      line_type: "part",
      description: "Self-test part",
      quantity: 1,
      unit_cost: 100,
      markup_pct: 25,
      unit_price: 125,
      line_total: 125,
    })
    const noInsModel = await getQuoteForOutput(db, noInsQ.id)
    check("no-insurer model returned", !!noInsModel)
    check("model.insurer is null", noInsModel?.insurer === null)
    // workshop branding should still resolve from Arundel
    check(
      "no-insurer model still has Arundel contact",
      noInsModel?.workshop.address === "15 Technology Dr, Arundel QLD 4214",
    )
    const r = await renderCustomer(noInsModel!)
    check("no-insurer customer PDF renders cleanly", pdfMagicOk(r.bytes))
  } finally {
    await db.from("quotes").delete().eq("id", noInsQ.id)
  }

  // -------------------------------------------------------------------------
  // 4. NULL-location fixture — graceful degrade to org name + ABN only.
  // -------------------------------------------------------------------------
  console.log("\nNULL-location fixture (graceful degrade)")
  const { data: nullLocQ } = await db
    .from("quotes")
    .insert({
      organisation_id: CARAFIX_ORG,
      canonical_job_type_id: jt.id,
      location_id: null,
      insurer_id: null,
      status: "draft",
      description: "STEP4B-SELFTEST-NULL-LOCATION",
    })
    .select("id")
    .single()
  if (!nullLocQ) throw new Error("could not insert null-location fixture")
  try {
    await db.from("quote_line_items").insert({
      organisation_id: CARAFIX_ORG,
      quote_id: nullLocQ.id,
      line_order: 1,
      line_type: "part",
      description: "Self-test part (no location)",
      quantity: 1,
      unit_cost: 50,
      markup_pct: 10,
      unit_price: 55,
      line_total: 55,
    })
    const nullLocModel = await getQuoteForOutput(db, nullLocQ.id)
    check("null-location model returned", !!nullLocModel)
    check("workshop.name still set", !!nullLocModel?.workshop.name)
    check("workshop.abn still set", !!nullLocModel?.workshop.abn)
    check("workshop.address is null", nullLocModel?.workshop.address === null)
    check("workshop.phone is null", nullLocModel?.workshop.phone === null)
    check("workshop.email is null", nullLocModel?.workshop.email === null)
    check("workshop.locationName is null", nullLocModel?.workshop.locationName === null)
    const r = await renderCustomer(nullLocModel!)
    check("null-location customer PDF renders without crashing", pdfMagicOk(r.bytes))
    const rW = await renderWorkshop(nullLocModel!)
    check("null-location workshop PDF renders without crashing", pdfMagicOk(rW.bytes))
  } finally {
    await db.from("quotes").delete().eq("id", nullLocQ.id)
  }

  // -------------------------------------------------------------------------
  // 5. Step 4b.1 polish — customer doc hides status + placeholder dividers;
  //    workshop doc keeps both; "Add section heading" stores empty label.
  // -------------------------------------------------------------------------
  console.log("\nStep 4b.1 polish")

  // 5a. Pure-function check of the placeholder denylist. Cheap guard against
  // future regressions in isPlaceholderDividerLabel().
  check("isPlaceholderDividerLabel(null) = true", isPlaceholderDividerLabel(null))
  check("isPlaceholderDividerLabel('') = true", isPlaceholderDividerLabel(""))
  check("isPlaceholderDividerLabel('   ') = true", isPlaceholderDividerLabel("   "))
  check("isPlaceholderDividerLabel('New section') = true", isPlaceholderDividerLabel("New section"))
  check("isPlaceholderDividerLabel('NEW SECTION') = true (case-insensitive)", isPlaceholderDividerLabel("NEW SECTION"))
  check("isPlaceholderDividerLabel('DESCRIPTION') = true", isPlaceholderDividerLabel("DESCRIPTION"))
  check("isPlaceholderDividerLabel('description') = true (case-insensitive)", isPlaceholderDividerLabel("description"))
  check("isPlaceholderDividerLabel('Roof works') = false", !isPlaceholderDividerLabel("Roof works"))

  // 5b. Q-100001 — confirm fixture matches the prompt's expectations: there
  // ARE two placeholder dividers (so the test is exercising the real case),
  // seven non-divider line items, total $2,691.50.
  const q1Dividers = model1.lines.filter((l) => l.isDivider)
  const q1NonDividers = model1.lines.filter((l) => !l.isDivider)
  check(
    "Q-100001 fixture: 2 placeholder dividers",
    q1Dividers.length === 2 && q1Dividers.every((l) => isPlaceholderDividerLabel(l.description)),
    `dividers=${q1Dividers.length} labels=${q1Dividers.map((l) => JSON.stringify(l.description)).join(",")}`,
  )
  check("Q-100001 fixture: 7 non-divider line items", q1NonDividers.length === 7, `got ${q1NonDividers.length}`)
  check(
    "Q-100001 fixture: total = $2,691.50",
    formatMoney(model1.totals.total) === "$2,691.50",
    `got ${formatMoney(model1.totals.total)}`,
  )

  // 5c. Customer HTML for Q-100001 must not show any status word and must
  // not render the placeholder divider rows. Line items + total still there.
  const custHtml1 = renderHtml(CustomerDocHtml, model1)
  check("Q-100001 customer HTML hides 'Status:' header text", !custHtml1.includes("Status:"))
  check(
    "Q-100001 customer HTML hides every status string",
    !/>\s*(draft|sent|accepted|rejected|invoiced|paid)\s*</i.test(custHtml1),
  )
  // Divider rows in the customer doc have a unique class signature. Both
  // placeholder dividers should be suppressed.
  const custDivRows = countCustomerDividerRows(custHtml1)
  check(
    "Q-100001 customer HTML emits zero divider <tr>s (both placeholders suppressed)",
    custDivRows === 0,
    `count=${custDivRows}`,
  )
  // Seven displayNumbers (1..7) all appear as text nodes for the line rows.
  const allNumbersPresent = q1NonDividers.every((l) =>
    custHtml1.includes(`>${l.displayNumber}<`),
  )
  check("Q-100001 customer HTML still renders all 7 line items in order", allNumbersPresent)
  check("Q-100001 customer HTML still shows total $2,691.50", custHtml1.includes("$2,691.50"))

  // 5d. Customer PDF — semantic tree check (binary stream is compressed).
  // Search the JSX tree for Text-leaf nodes whose exact value equals a
  // placeholder divider's stored label. With suppression, count = 0.
  const custPdfTree = customerPdfText(model1)
  check("Q-100001 customer PDF tree has no 'Status:'", !pdfTreeContains(custPdfTree, "Status:"))
  const uniqueDividerLabels = Array.from(new Set(q1Dividers.map((d) => d.description)))
  for (const label of uniqueDividerLabels) {
    const n = pdfTreeCountExactLeaf(custPdfTree, label)
    check(
      `Q-100001 customer PDF tree omits placeholder label ${JSON.stringify(label)} as a Text leaf`,
      n === 0,
      `exact-leaf count=${n}`,
    )
  }

  // 5e. Workshop HTML + PDF — status and placeholder dividers MUST remain
  // (workshop is internal; James knows what they are).
  const wkHtml1 = renderHtml(WorkshopDocHtml, model1)
  check("Q-100001 workshop HTML still shows status", /Status/i.test(wkHtml1))
  const wkDivRows = countWorkshopDividerRows(wkHtml1)
  check(
    "Q-100001 workshop HTML still renders both placeholder dividers",
    wkDivRows === 2,
    `count=${wkDivRows}`,
  )
  const wkPdfTree = workshopPdfText(model1)
  check(
    "Q-100001 workshop PDF tree still contains the status word",
    pdfTreeContains(wkPdfTree, "Status"),
  )
  // For each unique stored divider label, expect at least one matching
  // text leaf in the workshop PDF tree (the dividers are still emitted).
  for (const label of uniqueDividerLabels) {
    const n = pdfTreeCountExactLeaf(wkPdfTree, label)
    check(
      `Q-100001 workshop PDF tree still renders divider label ${JSON.stringify(label)}`,
      n >= 1,
      `exact-leaf count=${n}`,
    )
  }

  // 5f. Real-label fixture — a divider with a genuine label must render as a
  // bold section heading on the customer doc.
  console.log("\nReal-label divider fixture")
  const { data: roofQ } = await db
    .from("quotes")
    .insert({
      organisation_id: CARAFIX_ORG,
      canonical_job_type_id: jt.id,
      location_id: arundel.id,
      insurer_id: null,
      status: "draft",
      description: "STEP4B1-SELFTEST-REAL-LABEL",
    })
    .select("id")
    .single()
  if (!roofQ) throw new Error("could not insert real-label fixture")
  try {
    await db.from("quote_line_items").insert([
      {
        organisation_id: CARAFIX_ORG,
        quote_id: roofQ.id,
        line_order: 1,
        line_type: "other",
        description: "Roof works",
        quantity: 0,
        unit: null,
        unit_cost: 0,
        markup_pct: 0,
        unit_price: 0,
        line_total: 0,
      },
      {
        organisation_id: CARAFIX_ORG,
        quote_id: roofQ.id,
        line_order: 2,
        line_type: "part",
        description: "Replacement panel",
        quantity: 1,
        unit_cost: 200,
        markup_pct: 25,
        unit_price: 250,
        line_total: 250,
      },
    ])
    const roofModel = await getQuoteForOutput(db, roofQ.id)
    if (!roofModel) throw new Error("roof-fixture model null")
    check("real-label divider detected as divider", roofModel.lines[0]?.isDivider === true)
    check("real-label divider NOT placeholder", !isPlaceholderDividerLabel(roofModel.lines[0]?.description ?? null))
    const roofCustHtml = renderHtml(CustomerDocHtml, roofModel)
    check("customer HTML renders 'Roof works' as a heading", roofCustHtml.includes("Roof works"))
    check("customer HTML still shows the line item below it", roofCustHtml.includes("Replacement panel"))
    check(
      "customer PDF tree renders 'Roof works'",
      pdfTreeContains(customerPdfText(roofModel), "Roof works"),
    )
  } finally {
    await db.from("quotes").delete().eq("id", roofQ.id)
  }

  // 5g. Empty-divider editor default — simulate the new "Add section heading"
  // behaviour by inserting a divider with description="". Confirm it persists,
  // the view-model treats it as a placeholder, and the customer doc omits it
  // while the workshop doc still renders it.
  // The UI focus/edit-on-create behaviour requires a browser harness and is
  // out of scope for this script (noted in step4b-summary.md).
  console.log("\nEmpty-divider editor default fixture")
  const { data: emptyQ } = await db
    .from("quotes")
    .insert({
      organisation_id: CARAFIX_ORG,
      canonical_job_type_id: jt.id,
      location_id: arundel.id,
      insurer_id: null,
      status: "draft",
      description: "STEP4B1-SELFTEST-EMPTY-DIVIDER",
    })
    .select("id")
    .single()
  if (!emptyQ) throw new Error("could not insert empty-divider fixture")
  try {
    await db.from("quote_line_items").insert([
      {
        organisation_id: CARAFIX_ORG,
        quote_id: emptyQ.id,
        line_order: 1,
        line_type: "other",
        description: "", // exactly what the new addHeading() inserts
        quantity: 0,
        unit: null,
        unit_cost: 0,
        markup_pct: 0,
        unit_price: 0,
        line_total: 0,
      },
      {
        organisation_id: CARAFIX_ORG,
        quote_id: emptyQ.id,
        line_order: 2,
        line_type: "labour",
        description: "Diagnose",
        quantity: 1,
        unit_cost: 140,
        markup_pct: 0,
        unit_price: 140,
        line_total: 140,
      },
    ])
    // Read back to confirm the empty string persisted (DB column is NOT NULL
    // but allows empty strings).
    const { data: storedDivider } = await db
      .from("quote_line_items")
      .select("description")
      .eq("quote_id", emptyQ.id)
      .eq("line_order", 1)
      .single()
    check("empty-divider stored description === ''", storedDivider?.description === "")

    const emptyModel = await getQuoteForOutput(db, emptyQ.id)
    if (!emptyModel) throw new Error("empty-divider model null")
    check("empty divider detected as divider in model", emptyModel.lines[0]?.isDivider === true)
    check(
      "empty divider classified as placeholder",
      isPlaceholderDividerLabel(emptyModel.lines[0]?.description ?? null),
    )
    const emptyCustHtml = renderHtml(CustomerDocHtml, emptyModel)
    check(
      "customer HTML omits the empty divider row",
      countCustomerDividerRows(emptyCustHtml) === 0,
    )
    check("customer HTML still shows the labour line", emptyCustHtml.includes("Diagnose"))

    // Now simulate James typing a name in the autofocused input and blurring
    // — the editor calls updateLineItem under the hood. Assert the new label
    // persists and is no longer treated as a placeholder.
    const dividerId = emptyModel.lines[0] && (
      (await db
        .from("quote_line_items")
        .select("id")
        .eq("quote_id", emptyQ.id)
        .eq("line_order", 1)
        .single()).data?.id
    )
    if (!dividerId) throw new Error("could not look up divider id for update")
    await db.from("quote_line_items").update({ description: "Engine works" }).eq("id", dividerId)
    const { data: updatedDivider } = await db
      .from("quote_line_items")
      .select("description")
      .eq("id", dividerId)
      .single()
    check(
      "renamed divider persists with the new label",
      updatedDivider?.description === "Engine works",
      `got ${JSON.stringify(updatedDivider?.description)}`,
    )
    const renamedModel = await getQuoteForOutput(db, emptyQ.id)
    check(
      "renamed divider no longer classified as placeholder",
      renamedModel != null &&
        !isPlaceholderDividerLabel(renamedModel.lines[0]?.description ?? null),
    )
    const renamedCustHtml = renderHtml(CustomerDocHtml, renamedModel!)
    check(
      "customer HTML now renders 'Engine works' as a heading",
      renamedCustHtml.includes("Engine works") && countCustomerDividerRows(renamedCustHtml) === 1,
    )
  } finally {
    await db.from("quotes").delete().eq("id", emptyQ.id)
  }

  // -------------------------------------------------------------------------
  // Summary.
  // -------------------------------------------------------------------------
  const elapsed = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`\n${pass} passed, ${fail} failed — ${elapsed}s`)
  console.log(
    `\nPDF render timings:` +
      `\n  Q-100001 customer  ${cust1.ms.toFixed(0)} ms (${(cust1.bytes.length / 1024).toFixed(1)} KB)` +
      `\n  Q-100001 workshop  ${wk1.ms.toFixed(0)} ms (${(wk1.bytes.length / 1024).toFixed(1)} KB)` +
      `\n  Q-100004 customer  ${cust4.ms.toFixed(0)} ms (${(cust4.bytes.length / 1024).toFixed(1)} KB)` +
      `\n  Q-100004 workshop  ${wk4.ms.toFixed(0)} ms (${(wk4.bytes.length / 1024).toFixed(1)} KB)`,
  )
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
