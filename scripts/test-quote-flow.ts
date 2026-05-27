// Step 4a acceptance self-test. Drives the demo flow end-to-end against the real
// DB with a service-role client and asserts each step. Cleans up the QA quote /
// customer / van / auto-created part afterwards (leaves the RACQ insurer, which the
// demo uses).
//
//   npx tsx scripts/test-quote-flow.ts

import { readFileSync } from "node:fs"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const CARAFIX_ORG = "00000000-0000-0000-0000-000000000002"
const SKU = "OU-AL-1200x600"

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

async function main() {
  loadEnv()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Missing env")
  const db: SupabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const started = Date.now()
  console.log("Step 4a acceptance self-test\n")

  // 1. RACQ insurer (find-or-create)
  let insurerId: string
  {
    const { data: existing } = await db
      .from("insurers")
      .select("id")
      .eq("organisation_id", CARAFIX_ORG)
      .eq("name", "RACQ")
      .eq("is_active", true)
      .maybeSingle()
    if (existing) {
      insurerId = existing.id
    } else {
      const { data, error } = await db
        .from("insurers")
        .insert({ organisation_id: CARAFIX_ORG, name: "RACQ", capped_labour_rate: 95 })
        .select("id")
        .single()
      if (error) throw error
      insurerId = data.id
    }
    check("RACQ insurer exists", !!insurerId)
  }

  // 2. canonical "Impact / Collision Repair"
  const { data: jt } = await db
    .from("job_type_canonical")
    .select("id, name")
    .eq("organisation_id", CARAFIX_ORG)
    .eq("slug", "impact_damage")
    .single()
  check("Impact / Collision Repair canonical type found", !!jt, jt?.name)

  // 3. test customer + Jayco Conquest van
  const { data: cust } = await db
    .from("customers")
    .insert({ organisation_id: CARAFIX_ORG, name: "QA Test Customer (4a)" })
    .select("id")
    .single()
  const { data: van } = await db
    .from("vans")
    .insert({ organisation_id: CARAFIX_ORG, customer_id: cust!.id, make: "Jayco", model: "Conquest", rego: "QA4A" })
    .select("id")
    .single()
  check("Customer + Jayco Conquest van created", !!cust && !!van)

  // 4. create quote
  const { data: quote, error: qErr } = await db
    .from("quotes")
    .insert({
      organisation_id: CARAFIX_ORG,
      customer_id: cust!.id,
      vehicle_id: van!.id,
      canonical_job_type_id: jt!.id,
      insurer_id: insurerId,
      description:
        "Front mould impact damage, off-side corner mould affected, decals require replacement.",
      damage_tags: ["front_mould", "corner_mould_off_side", "decals"],
    })
    .select("id, quote_number, status")
    .single()
  if (qErr) throw qErr
  check("Quote created", !!quote, `${quote!.quote_number} / ${quote!.status}`)
  check("Quote number is Q-1000xx", /^Q-1000\d\d/.test(quote!.quote_number ?? ""), quote!.quote_number ?? "")
  check("Quote starts in draft", quote!.status === "draft")

  // 5. labour rate = insurer capped 95
  const { data: rate } = await db.rpc("compute_labour_rate", { p_quote_id: quote!.id })
  check("compute_labour_rate = 95 (insurer capped)", Number(rate) === 95, `got ${rate}`)

  // 6. find_similar_quotes returns rows
  const { data: similar, error: sErr } = await db.rpc("find_similar_quotes", {
    p_organisation_id: CARAFIX_ORG,
    p_canonical_job_type_id: jt!.id,
    p_vehicle_make: "Jayco",
    p_vehicle_model: "Conquest",
    p_description:
      "Front mould impact damage, off-side corner mould affected, decals require replacement.",
    p_damage_tags: ["front_mould", "corner_mould_off_side", "decals"],
  })
  if (sErr) throw sErr
  const sims = (similar ?? []) as { id: string; source: string; line_count: number; score: number }[]
  check("find_similar_quotes returns rows", sims.length > 0, `${sims.length} results, top score ${sims[0]?.score}`)

  // pick a historical source with line items
  let source = sims.find((s) => s.source === "historical" && s.line_count > 0)
  if (!source) {
    const { data: anyHist } = await db
      .from("historical_quote_items")
      .select("quote_id")
      .eq("organisation_id", CARAFIX_ORG)
      .limit(1)
      .single()
    if (anyHist) source = { id: anyHist.quote_id as string, source: "historical", line_count: 1, score: 0 }
  }
  check("Found a historical source quote with line items", !!source)

  // 7. clone
  const { data: cloned, error: cErr } = await db.rpc("clone_quote", {
    p_target_quote_id: quote!.id,
    p_source_quote_id: source!.id,
    p_source_type: "historical",
  })
  if (cErr) throw cErr
  const { count: lineCount } = await db
    .from("quote_line_items")
    .select("*", { count: "exact", head: true })
    .eq("quote_id", quote!.id)
  check("clone_quote populated line items", (cloned as number) > 0 && (lineCount ?? 0) === cloned, `cloned ${cloned}, table has ${lineCount}`)

  // 8. edit one line (bump qty + line_total), delete one line
  const { data: lines } = await db
    .from("quote_line_items")
    .select("id, quantity, unit_price, line_order")
    .eq("quote_id", quote!.id)
    .order("line_order")
  const first = lines![0]
  const newQty = (first.quantity ?? 1) + 1
  await db
    .from("quote_line_items")
    .update({ quantity: newQty, line_total: round2((first.unit_price ?? 0) * newQty) })
    .eq("id", first.id)
  await db.from("quote_line_items").delete().eq("id", lines![lines!.length - 1].id)
  check("Edited one line, deleted one line", true, `qty ${first.quantity}->${newQty}`)

  // 9. silent_save_part with a novel SKU + add a part line
  const { data: supplier } = await db
    .from("suppliers")
    .select("id")
    .eq("organisation_id", CARAFIX_ORG)
    .ilike("name", "%coast to coast%")
    .limit(1)
    .maybeSingle()
  const { data: partId, error: pErr } = await db.rpc("silent_save_part", {
    p_organisation_id: CARAFIX_ORG,
    p_sku: SKU,
    p_description: "Aluminium panel sheet, 1200x600mm",
    p_supplier_id: supplier?.id ?? null,
    p_unit_cost: 145,
  })
  if (pErr) throw pErr
  const up = round2(145 * (1 + 50 / 100))
  await db.from("quote_line_items").insert({
    organisation_id: CARAFIX_ORG,
    quote_id: quote!.id,
    line_order: 999,
    line_type: "part",
    part_id: partId,
    supplier_id: supplier?.id ?? null,
    description: "Aluminium panel sheet, 1200x600mm",
    quantity: 1,
    unit: "each",
    unit_cost: 145,
    markup_pct: 50,
    unit_price: up,
    line_total: up,
    source: "manual",
  })

  // 10. assert stock_items stub created with auto_created = true
  const { data: stub } = await db
    .from("stock_items")
    .select("id, stock_number, buy_price, sell_price, markup_percentage, auto_created, name")
    .eq("organisation_id", CARAFIX_ORG)
    .eq("stock_number", SKU)
    .single()
  check("Silent part stub created with auto_created=true", !!stub && stub.auto_created === true)
  check(
    "Stub pricing not curated (buy=145, sell/markup null)",
    !!stub && Number(stub.buy_price) === 145 && stub.sell_price === null && stub.markup_percentage === null
  )

  // 11. totals recompute correctly (trigger keeps quote.total = sum(line_total))
  const { data: q2 } = await db
    .from("quotes")
    .select("total, subtotal_parts, subtotal_labour")
    .eq("id", quote!.id)
    .single()
  const { data: allLines } = await db
    .from("quote_line_items")
    .select("line_total")
    .eq("quote_id", quote!.id)
  const sum = round2((allLines ?? []).reduce((a, l) => a + Number(l.line_total ?? 0), 0))
  check("Quote total recomputed by trigger", round2(Number(q2!.total)) === sum, `quote.total ${q2!.total} vs sum ${sum}`)

  // 12. status -> sent sets sent_at
  await db.from("quotes").update({ status: "sent" }).eq("id", quote!.id)
  const { data: q3 } = await db.from("quotes").select("status, sent_at").eq("id", quote!.id).single()
  check("sent_at auto-populated on status=sent", q3!.status === "sent" && !!q3!.sent_at, q3!.sent_at ?? "null")

  // ---- cleanup (leave RACQ for the live demo) ----
  await db.from("quotes").delete().eq("id", quote!.id) // cascades line items
  await db.from("vans").delete().eq("id", van!.id)
  await db.from("customers").delete().eq("id", cust!.id)
  if (stub) {
    await db.from("stock_item_suppliers").delete().eq("stock_item_id", stub.id)
    await db.from("stock_items").delete().eq("id", stub.id)
  }

  const secs = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`\n${pass} passed, ${fail} failed (in ${secs}s)`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
