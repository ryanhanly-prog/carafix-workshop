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
import { createElement, type ReactElement } from "react"
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer"

import type { Database } from "@/lib/database.types"
import { getQuoteForOutput, type QuoteOutputModel } from "@/lib/quote-output"
import { CustomerDocPdf } from "@/components/quotes/output/customer-doc-pdf"
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
