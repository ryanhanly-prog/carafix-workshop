// Step 4a.1 acceptance self-test. Creates a Jayco Starcraft hail-damage test quote,
// runs find_similar_quotes against the corpus, and asserts the rebuilt scoring
// gives real spread + match reasons + preview. Cleans up afterward.
//
//   npx tsx scripts/test-similarity.ts

import { readFileSync } from "node:fs"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const ORG = "00000000-0000-0000-0000-000000000002"

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
  if (ok) pass++
  else fail++
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`)
}
function info(name: string, detail: string) {
  console.log(`  ℹ️  ${name} — ${detail}`)
}

type Similar = {
  id: string
  source: string
  score: number
  preview_text: string | null
  match_reasons: string[] | null
  line_count: number
}

async function main() {
  loadEnv()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Missing env")
  const db: SupabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log("Step 4a.1 similarity self-test\n")

  const { data: jt } = await db
    .from("job_type_canonical")
    .select("id")
    .eq("organisation_id", ORG)
    .eq("slug", "storm_damage")
    .single()
  const { data: insurer } = await db
    .from("insurers")
    .select("id")
    .eq("organisation_id", ORG)
    .eq("name", "RACQ")
    .eq("is_active", true)
    .maybeSingle()

  const { data: cust } = await db
    .from("customers")
    .insert({ organisation_id: ORG, name: "QA Similarity Customer (4a1)" })
    .select("id")
    .single()
  const { data: van } = await db
    .from("vans")
    .insert({ organisation_id: ORG, customer_id: cust!.id, make: "Jayco", model: "Starcraft", rego: "QA41" })
    .select("id")
    .single()

  const description = "Hail damage to side panels, roof denting, awning rail bent"
  const damageTags = ["hail", "panel", "roof", "awning"]
  const { data: quote } = await db
    .from("quotes")
    .insert({
      organisation_id: ORG,
      customer_id: cust!.id,
      vehicle_id: van!.id,
      canonical_job_type_id: jt!.id,
      insurer_id: insurer?.id ?? null,
      description,
      damage_tags: damageTags,
    })
    .select("id")
    .single()

  // find_similar (exclude self, as the UI does)
  const { data: simRaw, error } = await db.rpc("find_similar_quotes", {
    p_organisation_id: ORG,
    p_canonical_job_type_id: jt!.id,
    p_vehicle_make: "Jayco",
    p_vehicle_model: "Starcraft",
    p_description: description,
    p_damage_tags: damageTags,
  })
  if (error) throw error
  const results = ((simRaw as Similar[]) ?? []).filter((r) => !(r.source === "live" && r.id === quote!.id))

  check("At least 3 results returned", results.length >= 3, `${results.length} results`)

  const ordered = results.every((r, i) => i === 0 || results[i - 1].score >= r.score)
  check("Results ordered by score descending", ordered, results.map((r) => Math.round(r.score)).join(", "))

  const top = results[0]
  check(
    "Top score is well above the old all-60 baseline",
    !!top && top.score > 60,
    top ? `top score ${top.score.toFixed(1)} (expected ~90-150)` : "no results"
  )
  if (top) info("Top score band", top.score >= 90 && top.score <= 150 ? "in 90-150 ✓" : `${top.score.toFixed(1)} (outside 90-150, still > baseline)`)

  const reasons = top?.match_reasons ?? []
  check(
    "Top match_reasons includes damage_tags or description_match",
    reasons.some((r) => r.startsWith("damage_tags:") || r === "description_match"),
    reasons.join(" | ")
  )
  check("Top result has non-empty preview_text", !!top?.preview_text && top.preview_text.trim().length > 0)

  // inferred_damage_tags coverage >= 70%
  const { count: total } = await db
    .from("historical_quotes")
    .select("*", { count: "exact", head: true })
    .eq("organisation_id", ORG)
  const { count: tagged } = await db
    .from("historical_quotes")
    .select("*", { count: "exact", head: true })
    .eq("organisation_id", ORG)
    .not("inferred_damage_tags", "is", null)
    .not("inferred_damage_tags", "eq", "{}")
  const tagPct = total ? Math.round(((tagged ?? 0) / total) * 100) : 0
  check("inferred_damage_tags populated on >= 70%", tagPct >= 70, `${tagPct}%`)

  // resolved_canonical — gated on alias mapping; report only (criterion #6).
  const { count: resolved } = await db
    .from("historical_quotes")
    .select("*", { count: "exact", head: true })
    .eq("organisation_id", ORG)
    .not("resolved_canonical_job_type_id", "is", null)
  const resPct = total ? Math.round(((resolved ?? 0) / total) * 100) : 0
  info(
    "resolved_canonical_job_type_id (criterion #6, gated on alias mapping)",
    `${resPct}% — expected ~0% until Catherine maps job-type aliases`
  )

  // cleanup
  await db.from("quotes").delete().eq("id", quote!.id)
  await db.from("vans").delete().eq("id", van!.id)
  await db.from("customers").delete().eq("id", cust!.id)

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
