// Self-test for the Mechanic Desk importer (Block D6).
//
// Runs the real orchestrator against the sample ZIPs in sample-imports/ using a
// service-role Supabase client (bypasses RLS, so we can drive it without a logged
// in session). Imports TWICE to prove idempotency: the second pass must report
// all-updates and zero inserts.
//
// Run with:  npx tsx scripts/test-import.ts
//
// NOTE: this writes the full ~3.5k customers / ~5.3k stock items into the Carafix
// org. That is the intended outcome of Step 3 (it replaces the demo-only data
// window), and it is idempotent, so re-running is safe.

import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import JSZip from "jszip"

import { KNOWN_CSV_FILES } from "@/lib/import/mechanic-desk"
import { runImport, type ImportFile } from "@/lib/import/run-import"
import type { Database } from "@/lib/database.types"

const CARAFIX_ORG = "00000000-0000-0000-0000-000000000002"
const KNOWN = new Set(Object.keys(KNOWN_CSV_FILES))

function loadEnv() {
  try {
    const text = readFileSync(".env.local", "utf8")
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
      }
    }
  } catch {
    // env may already be present
  }
}

async function loadSampleFiles(): Promise<ImportFile[]> {
  const dir = "sample-imports"
  const zips = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".zip"))
  const files: ImportFile[] = []
  for (const name of zips) {
    const buf = readFileSync(join(dir, name))
    const zip = await JSZip.loadAsync(buf)
    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue
      const base = entry.name.split("/").pop() ?? entry.name
      if (!KNOWN.has(base)) continue
      files.push({ name: base, content: await entry.async("string") })
    }
  }
  console.log(`Loaded ${zips.length} ZIP(s), ${files.length} known CSV(s):`)
  console.log("  " + files.map((f) => f.name).join(", "))
  return files
}

async function main() {
  loadEnv()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY")

  const supabase = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const files = await loadSampleFiles()

  for (const pass of [1, 2]) {
    console.log(`\n========== PASS ${pass} ==========`)
    const t0 = Date.now()
    const result = await runImport(supabase, CARAFIX_ORG, files)
    const secs = ((Date.now() - t0) / 1000).toFixed(1)
    console.log(`done in ${secs}s`)
    console.table(
      Object.entries(result.stats).map(([entity, s]) => ({
        entity,
        ...(s as Record<string, number>),
      }))
    )
    console.log("totals:", result.totals)
    console.log(`parse errors: ${result.parseErrors.length}, db errors: ${result.dbErrors.length}`)
    if (result.dbErrors.length) console.log("DB errors:", result.dbErrors.slice(0, 10))
  }

  // Final authoritative row counts.
  const tables = [
    "customers",
    "stock_items",
    "suppliers",
    "stock_item_suppliers",
    "historical_invoices",
    "historical_invoice_items",
    "historical_quotes",
    "historical_quote_items",
  ] as const
  console.log("\n========== FINAL ROW COUNTS (Carafix org) ==========")
  const loose = supabase as unknown as SupabaseClient
  for (const t of tables) {
    let q = loose.from(t).select("*", { count: "exact", head: true })
    if (t !== "stock_item_suppliers") q = q.eq("organisation_id", CARAFIX_ORG)
    const { count, error } = await q
    console.log(`  ${t}: ${error ? "ERR " + error.message : count}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
