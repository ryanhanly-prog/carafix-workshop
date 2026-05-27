// Block D — run the full Mechanic Desk historical export through the real import
// orchestrator (service-role client, so no session needed). Single pass; the
// pipeline is idempotent, so it can be re-run safely.
//
//   npx tsx scripts/run-full-import.ts

import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { createClient } from "@supabase/supabase-js"
import JSZip from "jszip"

import { KNOWN_CSV_FILES } from "@/lib/import/mechanic-desk"
import { runImport, type ImportFile } from "@/lib/import/run-import"
import type { Database } from "@/lib/database.types"

const CARAFIX_ORG = "00000000-0000-0000-0000-000000000002"
const KNOWN = new Set(Object.keys(KNOWN_CSV_FILES))
const DIR = "full-historical-import"

function loadEnv() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
    }
  } catch {
    /* env may already be set */
  }
}

async function main() {
  loadEnv()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY")
  const supabase = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const zips = readdirSync(DIR).filter((f) => f.toLowerCase().endsWith(".zip"))
  if (zips.length === 0) throw new Error(`No ZIP found in ${DIR}/`)

  const files: ImportFile[] = []
  for (const name of zips) {
    const zip = await JSZip.loadAsync(readFileSync(join(DIR, name)))
    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue
      const base = entry.name.split("/").pop() ?? entry.name
      if (!KNOWN.has(base)) continue // skip out-of-scope CSVs
      files.push({ name: base, content: await entry.async("string") })
    }
  }
  console.log(`Loaded ${zips.length} ZIP(s); ${files.length} in-scope CSV(s):`)
  console.log("  " + files.map((f) => f.name).join(", "))

  console.log("\nRunning import…")
  const t0 = Date.now()
  const result = await runImport(supabase, CARAFIX_ORG, files)
  const secs = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`done in ${secs}s\n`)

  console.table(
    Object.entries(result.stats).map(([entity, s]) => ({ entity, ...(s as Record<string, number>) }))
  )
  console.log("totals:", result.totals)
  console.log(`parse errors: ${result.parseErrors.length}, db errors: ${result.dbErrors.length}`)
  if (result.dbErrors.length) console.log("DB errors (first 10):", result.dbErrors.slice(0, 10))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
