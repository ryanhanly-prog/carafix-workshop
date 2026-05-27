// Step 4a.2 self-test: similar-quotes self-exclusion + damage-tag auto-suggest.
//   npx tsx scripts/test-tag-suggest.ts

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

let pass = 0, fail = 0
const check = (n: string, ok: boolean, d?: string) => {
  if (ok) pass++; else fail++
  console.log(`  ${ok ? "✅" : "❌"} ${n}${d ? ` — ${d}` : ""}`)
}

async function main() {
  loadEnv()
  const db: SupabaseClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  console.log("Step 4a.2 self-test\n")

  const { data: jt } = await db.from("job_type_canonical").select("id, default_damage_tags")
    .eq("organisation_id", ORG).eq("slug", "storm_damage").single()

  // --- Test 2: Layer-1 default tags ---
  check(
    "Storm Damage default_damage_tags = [hail, water, panel, roof]",
    JSON.stringify(jt!.default_damage_tags) === JSON.stringify(["hail", "water", "panel", "roof"]),
    JSON.stringify(jt!.default_damage_tags)
  )

  // --- Test 3: Layer-2 description suggestions ---
  const { data: sugg } = await db.rpc("suggest_damage_tags", {
    p_text: "Awning rail bent and ripped fabric",
    p_org: ORG,
  })
  const s = (sugg as string[]) ?? []
  check(
    "Description 'Awning rail bent and ripped fabric' suggests awning, awning_rail, fabric",
    ["awning", "awning_rail", "fabric"].every((t) => s.includes(t)),
    s.join(", ")
  )

  // --- Test 1: threshold/exclude — create quote, ensure >=4 results, no self ---
  const { data: cust } = await db.from("customers")
    .insert({ organisation_id: ORG, name: "QA Tag Customer (4a2)" }).select("id").single()
  const { data: van } = await db.from("vans")
    .insert({ organisation_id: ORG, customer_id: cust!.id, make: "Jayco", model: "Starcraft", rego: "QA42" })
    .select("id").single()
  const { data: quote } = await db.from("quotes").insert({
    organisation_id: ORG,
    customer_id: cust!.id,
    vehicle_id: van!.id,
    canonical_job_type_id: jt!.id,
    description: "Hail damage to roof and side panels",
    damage_tags: ["hail", "panel", "roof", "awning", "decal"],
  }).select("id").single()

  const { data: results, error } = await db.rpc("find_similar_quotes", {
    p_organisation_id: ORG,
    p_canonical_job_type_id: jt!.id,
    p_vehicle_make: "Jayco",
    p_vehicle_model: "Starcraft",
    p_description: "Hail damage to roof and side panels",
    p_damage_tags: ["hail", "panel", "roof", "awning", "decal"],
    p_exclude_quote_id: quote!.id,
  })
  if (error) throw error
  const rows = (results as { id: string; score: number }[]) ?? []
  check("find_similar returns >= 4 results", rows.length >= 4, `${rows.length} results, scores ${rows.map((r) => Math.round(r.score)).join("/")}`)
  check("No self-match in results", !rows.some((r) => r.id === quote!.id))

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
