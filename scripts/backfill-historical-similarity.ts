// Step 4a.1 one-time (re-runnable) backfill of similarity fields on
// historical_quotes. Calls the set-based SQL backfill functions in dependency
// order, then prints stats. Safe to re-run (idempotent) — notably the
// resolved-canonical backfill auto-improves as Catherine maps job-type aliases.
//
//   npx tsx scripts/backfill-historical-similarity.ts

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

async function main() {
  loadEnv()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Missing env")
  const db: SupabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const t0 = Date.now()
  console.log("Backfilling historical_quotes similarity fields…\n")

  // Order matters: combined_search_text + search_tokens first (damage tags read tokens).
  const steps: [string, string][] = [
    ["backfill_combined_search_text", "combined_search_text + search_tokens"],
    ["backfill_total_labour_hours", "total_labour_hours"],
    ["backfill_inferred_damage_tags", "inferred_damage_tags"],
    ["backfill_resolved_canonical", "resolved_canonical_job_type_id"],
  ]
  for (const [fn, label] of steps) {
    const { data, error } = await db.rpc(fn, { p_org: ORG })
    if (error) throw new Error(`${fn}: ${error.message}`)
    console.log(`  ${label}: ${data}`)
  }

  // ---- stats ----
  const { count: total } = await db
    .from("historical_quotes")
    .select("*", { count: "exact", head: true })
    .eq("organisation_id", ORG)
  const { count: withTags } = await db
    .from("historical_quotes")
    .select("*", { count: "exact", head: true })
    .eq("organisation_id", ORG)
    .not("inferred_damage_tags", "is", null)
    .not("inferred_damage_tags", "eq", "{}")
  const { count: withCanon } = await db
    .from("historical_quotes")
    .select("*", { count: "exact", head: true })
    .eq("organisation_id", ORG)
    .not("resolved_canonical_job_type_id", "is", null)
  const { count: withText } = await db
    .from("historical_quotes")
    .select("*", { count: "exact", head: true })
    .eq("organisation_id", ORG)
    .not("combined_search_text", "is", null)
    .not("combined_search_text", "eq", "")

  const pct = (n: number | null) => (total ? `${Math.round(((n ?? 0) / total) * 100)}%` : "—")
  console.log("\n--- stats ---")
  console.log(`  total historical_quotes: ${total}`)
  console.log(`  combined_search_text populated: ${withText} (${pct(withText ?? 0)})`)
  console.log(`  inferred_damage_tags populated: ${withTags} (${pct(withTags ?? 0)})`)
  console.log(`  resolved_canonical_job_type_id: ${withCanon} (${pct(withCanon ?? 0)})`)
  console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
