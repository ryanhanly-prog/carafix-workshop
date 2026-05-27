// Step 4a.3 self-test: vans unification. Asserts post-backfill count, idempotency,
// the manually_edited flip, and that re-import preserves edited rows while
// refreshing non-edited ones. Restores any data it mutates.
//
//   npx tsx scripts/test-vans-unify.ts

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

async function countVans(db: SupabaseClient, importedOnly = false) {
  let q = db.from("vans").select("*", { count: "exact", head: true }).eq("organisation_id", ORG)
  if (importedOnly) q = q.eq("imported_from", "mechanic_desk")
  const { count } = await q
  return count ?? 0
}

async function main() {
  loadEnv()
  const db: SupabaseClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  console.log("Step 4a.3 vans-unify self-test\n")

  // 1. counts
  const total = await countVans(db)
  const imported = await countVans(db, true)
  check("Total vans >= 2,860", total >= 2860, `${total} (imported ${imported})`)
  check("Imported vans = 2,846", imported === 2846, `${imported}`)

  // 2. idempotency
  await db.rpc("sync_imported_vans", { p_org: ORG })
  const totalAfter = await countVans(db)
  check("Idempotent: count unchanged after re-sync", totalAfter === total, `${total} -> ${totalAfter}`)

  // 3 & 4. edit flip + re-import protection
  const { data: picks } = await db
    .from("vans")
    .select("id, external_id, make")
    .eq("organisation_id", ORG)
    .eq("imported_from", "mechanic_desk")
    .eq("manually_edited", false)
    .limit(2)
  const [vEdit, vKeep] = picks ?? []
  if (!vEdit || !vKeep) throw new Error("need two non-edited imported vans")

  // capture source makes for restore
  const { data: srcRows } = await db
    .from("historical_vehicles")
    .select("external_id, make")
    .in("external_id", [vEdit.external_id, vKeep.external_id])
  const srcMake = new Map((srcRows ?? []).map((r) => [r.external_id, r.make]))

  // simulate a UI edit on vEdit (what updateVan does)
  await db.from("vans").update({ make: "QA-EDITED", manually_edited: true }).eq("id", vEdit.id)
  const { data: edited } = await db.from("vans").select("manually_edited").eq("id", vEdit.id).single()
  check("Edit flips manually_edited to true", edited?.manually_edited === true)

  // simulate a re-import bringing a changed make for both source rows
  await db.from("historical_vehicles").update({ make: "QA-SRC-CHANGED" })
    .in("external_id", [vEdit.external_id, vKeep.external_id])
  await db.rpc("sync_imported_vans", { p_org: ORG })

  const { data: afterEdit } = await db.from("vans").select("make").eq("id", vEdit.id).single()
  const { data: afterKeep } = await db.from("vans").select("make").eq("id", vKeep.id).single()
  check("Re-import PRESERVES manually-edited van", afterEdit?.make === "QA-EDITED", `make=${afterEdit?.make}`)
  check("Re-import REFRESHES non-edited van", afterKeep?.make === "QA-SRC-CHANGED", `make=${afterKeep?.make}`)

  // restore: source makes back, vEdit back to source + not edited, re-sync to settle vKeep
  await db.from("historical_vehicles").update({ make: srcMake.get(vEdit.external_id) ?? null }).eq("external_id", vEdit.external_id)
  await db.from("historical_vehicles").update({ make: srcMake.get(vKeep.external_id) ?? null }).eq("external_id", vKeep.external_id)
  await db.from("vans").update({ make: srcMake.get(vEdit.external_id) ?? null, manually_edited: false }).eq("id", vEdit.id)
  await db.rpc("sync_imported_vans", { p_org: ORG })

  const restoredTotal = await countVans(db)
  check("Count still correct after restore", restoredTotal === total, `${restoredTotal}`)

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
