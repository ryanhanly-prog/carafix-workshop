// Import orchestrator.
//
// Pure of any Next.js / request concerns: give it a Supabase client (user-scoped
// in the app, service-role in the self-test), an organisation id, and the set of
// CSV files pulled out of one or more Mechanic Desk export ZIPs. It parses,
// de-duplicates across files, and writes everything in dependency order with
// idempotent upserts.
//
// Idempotency:
//  - customers / stock_items / suppliers / invoices / quotes / vehicles / jobs
//    upsert on their org-scoped natural key, so a re-import updates rather than
//    duplicates.
//  - invoice/quote LINE ITEMS have no stable id, so they are replaced by parent
//    number. TIMESHEETS have no key at all, so they are fully replaced per org.
//
// Each top-level section is wrapped in safe(): a malformed/empty file is logged
// and skipped, never failing the whole batch.

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/database.types"
import {
  KNOWN_CSV_FILES,
  parseCustomers,
  parseInvoiceItems,
  parseInvoicesSummary,
  parseJobs,
  parseQuoteItems,
  parseQuotes,
  parseStocks,
  parseTimesheets,
  parseVehicles,
  type ParseError,
  type StockRow,
} from "@/lib/import/mechanic-desk"

export type DB = SupabaseClient<Database>
type LooseDB = SupabaseClient

export type EntityStat = { inserted: number; updated: number; failed: number }
export type ImportStats = {
  customers: EntityStat
  suppliers: EntityStat
  stock_items: EntityStat
  stock_item_suppliers: { linked: number }
  historical_invoices: EntityStat
  historical_invoice_items: EntityStat
  historical_quotes: EntityStat
  historical_quote_items: EntityStat
  historical_vehicles: EntityStat
  historical_jobs: EntityStat
  historical_timesheets: EntityStat
  job_type_aliases: { discovered: number }
}
export type ImportResult = {
  stats: ImportStats
  parseErrors: ParseError[]
  dbErrors: string[]
  skippedFiles: string[]
  totals: { inserted: number; updated: number; failed: number }
}

export type ImportFile = { name: string; content: string }

const BATCH = 500
const LINE_BATCH = 1000 // larger batches for the high-volume line-item tables

function emptyStat(): EntityStat {
  return { inserted: 0, updated: 0, failed: 0 }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function filesOfKind(files: ImportFile[], kind: string): string[] {
  const wanted = Object.entries(KNOWN_CSV_FILES)
    .filter(([, k]) => k === kind)
    .map(([name]) => name)
  return files
    .filter((f) => {
      const base = f.name.split("/").pop() ?? f.name
      return wanted.includes(base)
    })
    .map((f) => f.content)
}

async function safe(label: string, dbErrors: string[], fn: () => Promise<void>) {
  try {
    await fn()
  } catch (e) {
    dbErrors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`)
  }
}

// Order is REQUIRED on paginated reads: range pagination without a stable sort
// can return overlapping/missing rows across pages, corrupting the key set.
async function fetchExistingKeys(
  db: LooseDB,
  table: string,
  org: string,
  col: string
): Promise<Set<string>> {
  const keys = new Set<string>()
  const page = 1000
  for (let from = 0; ; from += page) {
    const { data, error } = await db
      .from(table)
      .select(col)
      .eq("organisation_id", org)
      .order(col, { ascending: true })
      .range(from, from + page - 1)
    if (error) throw new Error(`fetch existing ${table}.${col}: ${error.message}`)
    const rows = (data ?? []) as unknown as Record<string, string | null>[]
    if (rows.length === 0) break
    for (const r of rows) {
      const v = r[col]
      if (v != null) keys.add(v)
    }
    if (rows.length < page) break
  }
  return keys
}

async function fetchKeyIdMap(
  db: LooseDB,
  table: string,
  org: string,
  keyCol: string
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const page = 1000
  for (let from = 0; ; from += page) {
    const { data, error } = await db
      .from(table)
      .select(`id, ${keyCol}`)
      .eq("organisation_id", org)
      .order("id", { ascending: true })
      .range(from, from + page - 1)
    if (error) throw new Error(`fetch id map ${table}: ${error.message}`)
    const rows = (data ?? []) as unknown as Record<string, string>[]
    if (rows.length === 0) break
    for (const r of rows) {
      if (r[keyCol] != null) map.set(r[keyCol], r.id)
    }
    if (rows.length < page) break
  }
  return map
}

async function upsertBatches(
  db: LooseDB,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
  stat: EntityStat,
  dbErrors: string[],
  ignoreDuplicates = false,
  batchSize = BATCH
) {
  for (const c of chunk(rows, batchSize)) {
    const { error } = await db.from(table).upsert(c, { onConflict, ignoreDuplicates })
    if (error) {
      stat.failed += c.length
      stat.inserted = Math.max(0, stat.inserted - c.length)
      dbErrors.push(`upsert ${table}: ${error.message}`)
    }
  }
}

async function insertBatches(
  db: LooseDB,
  table: string,
  rows: Record<string, unknown>[],
  dbErrors: string[],
  batchSize = BATCH
): Promise<number> {
  let failed = 0
  for (const c of chunk(rows, batchSize)) {
    const { error } = await db.from(table).insert(c)
    if (error) {
      failed += c.length
      dbErrors.push(`insert ${table}: ${error.message}`)
    }
  }
  return failed
}

// ---- job-type suggestion (Jaccard over word tokens; no LLM) ----
function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter(Boolean)
  )
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}
function suggestCanonical(
  raw: string,
  canonicals: { id: string; name: string; slug: string }[]
): { id: string; confidence: number } | null {
  const rt = tokenize(raw)
  let best: { id: string; confidence: number } | null = null
  for (const c of canonicals) {
    const sim = jaccard(rt, tokenize(`${c.name} ${c.slug.replace(/_/g, " ")}`))
    if (sim > 0.5 && (!best || sim > best.confidence)) best = { id: c.id, confidence: sim }
  }
  return best
}

export async function runImport(
  supabase: DB,
  organisationId: string,
  files: ImportFile[]
): Promise<ImportResult> {
  const org = organisationId
  const db = supabase as unknown as LooseDB
  const stats: ImportStats = {
    customers: emptyStat(),
    suppliers: emptyStat(),
    stock_items: emptyStat(),
    stock_item_suppliers: { linked: 0 },
    historical_invoices: emptyStat(),
    historical_invoice_items: emptyStat(),
    historical_quotes: emptyStat(),
    historical_quote_items: emptyStat(),
    historical_vehicles: emptyStat(),
    historical_jobs: emptyStat(),
    historical_timesheets: emptyStat(),
    job_type_aliases: { discovered: 0 },
  }
  const parseErrors: ParseError[] = []
  const dbErrors: string[] = []
  const skippedFiles: string[] = []
  const nowISO = new Date().toISOString()
  const countSkips = (errs: ParseError[]) => errs.filter((e) => e.message.includes("skipped")).length

  // Job-type taxonomy context, loaded once. Raw label -> existing confirmed
  // canonical (for back-link backfill); canonical list (for suggestions).
  const existingAliasCanonical = new Map<string, string | null>()
  let canonicalTypes: { id: string; name: string; slug: string }[] = []
  const jobTypeCounts = new Map<string, number>()
  await safe("load job-type context", dbErrors, async () => {
    const { data: cts } = await db
      .from("job_type_canonical")
      .select("id, name, slug")
      .eq("organisation_id", org)
    canonicalTypes = (cts ?? []) as { id: string; name: string; slug: string }[]
    const { data: al } = await db
      .from("job_type_aliases")
      .select("raw_value, canonical_id")
      .eq("organisation_id", org)
    for (const a of (al ?? []) as { raw_value: string; canonical_id: string | null }[]) {
      existingAliasCanonical.set(a.raw_value, a.canonical_id)
    }
  })
  const countJobType = (raw: string | null | undefined) => {
    const v = (raw ?? "").trim()
    if (v) jobTypeCounts.set(v, (jobTypeCounts.get(v) ?? 0) + 1)
  }

  // ---------------- Customers ----------------
  await safe("customers", dbErrors, async () => {
    const dedup = new Map<string, ReturnType<typeof parseCustomers>["rows"][number]["row"]>()
    let skipped = 0
    for (const csv of filesOfKind(files, "customers")) {
      const res = parseCustomers(csv)
      parseErrors.push(...res.errors)
      skipped += countSkips(res.errors)
      for (const { row } of res.rows) dedup.set(row.external_id ?? `name:${row.name}`, row)
    }
    const rows = [...dedup.values()]
    if (rows.length === 0) return
    const existing = await fetchExistingKeys(db, "customers", org, "external_id")
    let inserted = 0
    let updated = 0
    const payload = rows.map((r) => {
      if (r.external_id && existing.has(r.external_id)) updated++
      else inserted++
      return { ...r, organisation_id: org }
    })
    stats.customers = { inserted, updated, failed: skipped }
    await upsertBatches(db, "customers", payload, "organisation_id,external_id", stats.customers, dbErrors)
  })

  // ---------------- Suppliers + Stock items ----------------
  const stockRows: StockRow[] = []
  await safe("stock_items", dbErrors, async () => {
    const dedup = new Map<string, StockRow>()
    let skipped = 0
    for (const csv of filesOfKind(files, "stocks")) {
      const res = parseStocks(csv)
      parseErrors.push(...res.errors)
      skipped += countSkips(res.errors)
      for (const { row } of res.rows) dedup.set(row.external_id ?? `sn:${row.stock_number}`, row)
    }
    stockRows.push(...dedup.values())
    if (stockRows.length === 0) return

    const supplierNames = new Set<string>()
    for (const s of stockRows) for (const n of s.suppliers) supplierNames.add(n)
    const existingSuppliers = await fetchExistingKeys(db, "suppliers", org, "name")
    let sInserted = 0
    let sUpdated = 0
    const supplierPayload = [...supplierNames].map((name) => {
      if (existingSuppliers.has(name)) sUpdated++
      else sInserted++
      return { name, organisation_id: org }
    })
    stats.suppliers = { inserted: sInserted, updated: sUpdated, failed: 0 }
    // Leave existing suppliers untouched so manually entered contact details survive.
    await upsertBatches(db, "suppliers", supplierPayload, "organisation_id,name", stats.suppliers, dbErrors, true)

    const existingStock = await fetchExistingKeys(db, "stock_items", org, "external_id")
    let inserted = 0
    let updated = 0
    const stockPayload = stockRows.map((r) => {
      if (r.external_id && existingStock.has(r.external_id)) updated++
      else inserted++
      const { suppliers: _s, first_supplier_stock_number: _f, ...cols } = r
      void _s
      void _f
      return { ...cols, organisation_id: org }
    })
    stats.stock_items = { inserted, updated, failed: skipped }
    await upsertBatches(db, "stock_items", stockPayload, "organisation_id,external_id", stats.stock_items, dbErrors)

    const supplierMap = await fetchKeyIdMap(db, "suppliers", org, "name")
    const stockMap = await fetchKeyIdMap(db, "stock_items", org, "external_id")
    const links: Record<string, unknown>[] = []
    for (const s of stockRows) {
      const stockId = s.external_id ? stockMap.get(s.external_id) : undefined
      if (!stockId) continue
      s.suppliers.forEach((name, idx) => {
        const supplierId = supplierMap.get(name)
        if (!supplierId) return
        links.push({
          stock_item_id: stockId,
          supplier_id: supplierId,
          supplier_stock_number: idx === 0 ? s.first_supplier_stock_number : null,
          is_primary: idx === 0,
        })
      })
    }
    for (const c of chunk(links, BATCH)) {
      const { error } = await db
        .from("stock_item_suppliers")
        .upsert(c, { onConflict: "stock_item_id,supplier_id", ignoreDuplicates: true })
      if (error) dbErrors.push(`upsert stock_item_suppliers: ${error.message}`)
      else stats.stock_item_suppliers.linked += c.length
    }
  })

  // ---------------- Invoices + items ----------------
  await safe("historical_invoices", dbErrors, async () => {
    const dedup = new Map<string, ReturnType<typeof parseInvoicesSummary>["rows"][number]["row"]>()
    let skipped = 0
    for (const csv of filesOfKind(files, "invoices")) {
      const res = parseInvoicesSummary(csv)
      parseErrors.push(...res.errors)
      skipped += countSkips(res.errors)
      for (const { row } of res.rows) dedup.set(row.invoice_number, row)
    }
    const rows = [...dedup.values()]
    if (rows.length === 0) return
    const existing = await fetchExistingKeys(db, "historical_invoices", org, "invoice_number")
    let inserted = 0
    let updated = 0
    const payload = rows.map((r) => {
      if (existing.has(r.invoice_number)) updated++
      else inserted++
      countJobType(r.first_job_type)
      return {
        ...r,
        organisation_id: org,
        job_type_canonical_id: r.first_job_type
          ? existingAliasCanonical.get(r.first_job_type.trim()) ?? null
          : null,
      }
    })
    stats.historical_invoices = { inserted, updated, failed: skipped }
    await upsertBatches(db, "historical_invoices", payload, "organisation_id,invoice_number", stats.historical_invoices, dbErrors)

    const invoiceMap = await fetchKeyIdMap(db, "historical_invoices", org, "invoice_number")
    const itemDedup: ReturnType<typeof parseInvoiceItems>["rows"][number]["row"][] = []
    let itemSkips = 0
    for (const csv of filesOfKind(files, "invoice_items")) {
      const res = parseInvoiceItems(csv)
      parseErrors.push(...res.errors)
      itemSkips += countSkips(res.errors)
      for (const { row } of res.rows) itemDedup.push(row)
    }
    const affectedNumbers = [...new Set(itemDedup.map((r) => r.invoice_number))]
    for (const c of chunk(affectedNumbers, BATCH)) {
      const { error } = await db
        .from("historical_invoice_items")
        .delete()
        .eq("organisation_id", org)
        .in("invoice_number", c)
      if (error) dbErrors.push(`delete historical_invoice_items: ${error.message}`)
    }
    let iInserted = 0
    let iUpdated = 0
    const itemPayload = itemDedup.map((r) => {
      if (existing.has(r.invoice_number)) iUpdated++
      else iInserted++
      return { ...r, organisation_id: org, invoice_id: invoiceMap.get(r.invoice_number) ?? null }
    })
    const failed = await insertBatches(db, "historical_invoice_items", itemPayload, dbErrors, LINE_BATCH)
    stats.historical_invoice_items = { inserted: iInserted, updated: iUpdated, failed: itemSkips + failed }
  })

  // ---------------- Quotes + items ----------------
  await safe("historical_quotes", dbErrors, async () => {
    const dedup = new Map<string, ReturnType<typeof parseQuotes>["rows"][number]["row"]>()
    let skipped = 0
    for (const csv of filesOfKind(files, "quotes")) {
      const res = parseQuotes(csv)
      parseErrors.push(...res.errors)
      skipped += countSkips(res.errors)
      for (const { row } of res.rows) dedup.set(row.quote_number, row)
    }
    const rows = [...dedup.values()]
    if (rows.length === 0) return
    const existing = await fetchExistingKeys(db, "historical_quotes", org, "quote_number")
    let inserted = 0
    let updated = 0
    const payload = rows.map((r) => {
      if (existing.has(r.quote_number)) updated++
      else inserted++
      return { ...r, organisation_id: org }
    })
    stats.historical_quotes = { inserted, updated, failed: skipped }
    await upsertBatches(db, "historical_quotes", payload, "organisation_id,quote_number", stats.historical_quotes, dbErrors)

    const quoteMap = await fetchKeyIdMap(db, "historical_quotes", org, "quote_number")
    const itemDedup: ReturnType<typeof parseQuoteItems>["rows"][number]["row"][] = []
    let itemSkips = 0
    for (const csv of filesOfKind(files, "quote_items")) {
      const res = parseQuoteItems(csv)
      parseErrors.push(...res.errors)
      itemSkips += countSkips(res.errors)
      for (const { row } of res.rows) itemDedup.push(row)
    }
    const affectedNumbers = [...new Set(itemDedup.map((r) => r.quote_number))]
    for (const c of chunk(affectedNumbers, BATCH)) {
      const { error } = await db
        .from("historical_quote_items")
        .delete()
        .eq("organisation_id", org)
        .in("quote_number", c)
      if (error) dbErrors.push(`delete historical_quote_items: ${error.message}`)
    }
    let qInserted = 0
    let qUpdated = 0
    const itemPayload = itemDedup.map((r) => {
      if (existing.has(r.quote_number)) qUpdated++
      else qInserted++
      return { ...r, organisation_id: org, quote_id: quoteMap.get(r.quote_number) ?? null }
    })
    const failed = await insertBatches(db, "historical_quote_items", itemPayload, dbErrors, LINE_BATCH)
    stats.historical_quote_items = { inserted: qInserted, updated: qUpdated, failed: itemSkips + failed }
  })

  // ---------------- Vehicles ----------------
  await safe("historical_vehicles", dbErrors, async () => {
    const dedup = new Map<string, ReturnType<typeof parseVehicles>["rows"][number]["row"]>()
    let skipped = 0
    for (const csv of filesOfKind(files, "vehicles")) {
      const res = parseVehicles(csv)
      parseErrors.push(...res.errors)
      skipped += countSkips(res.errors)
      for (const { row } of res.rows) if (row.external_id) dedup.set(row.external_id, row)
    }
    const rows = [...dedup.values()]
    if (rows.length === 0) return
    const existing = await fetchExistingKeys(db, "historical_vehicles", org, "external_id")
    let inserted = 0
    let updated = 0
    const payload = rows.map((r) => {
      if (r.external_id && existing.has(r.external_id)) updated++
      else inserted++
      return { ...r, organisation_id: org }
    })
    stats.historical_vehicles = { inserted, updated, failed: skipped }
    await upsertBatches(db, "historical_vehicles", payload, "organisation_id,external_id", stats.historical_vehicles, dbErrors)
  })

  // ---------------- Jobs ----------------
  await safe("historical_jobs", dbErrors, async () => {
    const dedup = new Map<string, ReturnType<typeof parseJobs>["rows"][number]["row"]>()
    let skipped = 0
    for (const csv of filesOfKind(files, "jobs")) {
      const res = parseJobs(csv)
      parseErrors.push(...res.errors)
      skipped += countSkips(res.errors)
      for (const { row } of res.rows) dedup.set(row.job_number, row)
    }
    const rows = [...dedup.values()]
    if (rows.length === 0) return
    const existing = await fetchExistingKeys(db, "historical_jobs", org, "job_number")
    let inserted = 0
    let updated = 0
    const payload = rows.map((r) => {
      if (existing.has(r.job_number)) updated++
      else inserted++
      countJobType(r.job_type_raw)
      return {
        ...r,
        organisation_id: org,
        job_type_canonical_id: r.job_type_raw
          ? existingAliasCanonical.get(r.job_type_raw.trim()) ?? null
          : null,
      }
    })
    stats.historical_jobs = { inserted, updated, failed: skipped }
    await upsertBatches(db, "historical_jobs", payload, "organisation_id,job_number", stats.historical_jobs, dbErrors)
  })

  // ---------------- Timesheets (no natural key → full replace per org) ----------------
  await safe("historical_timesheets", dbErrors, async () => {
    const csvs = filesOfKind(files, "timesheets")
    if (csvs.length === 0) return
    const rows: ReturnType<typeof parseTimesheets>["rows"][number]["row"][] = []
    for (const csv of csvs) {
      const res = parseTimesheets(csv)
      parseErrors.push(...res.errors)
      for (const { row } of res.rows) rows.push(row)
    }
    // Replace: timesheets are import-only, so wipe this org's set and re-insert.
    const { error: delErr } = await db
      .from("historical_timesheets")
      .delete()
      .eq("organisation_id", org)
    if (delErr) {
      dbErrors.push(`delete historical_timesheets: ${delErr.message}`)
      return
    }
    const payload = rows.map((r) => ({ ...r, organisation_id: org }))
    const failed = await insertBatches(db, "historical_timesheets", payload, dbErrors, LINE_BATCH)
    stats.historical_timesheets = { inserted: payload.length - failed, updated: 0, failed }
  })

  // ---------------- Job-type aliases (after invoices + jobs counted) ----------------
  await safe("job_type_aliases", dbErrors, async () => {
    if (jobTypeCounts.size === 0) return
    const payload = [...jobTypeCounts.entries()].map(([raw, count]) => {
      const suggestion = suggestCanonical(raw, canonicalTypes)
      return {
        organisation_id: org,
        raw_value: raw,
        occurrence_count: count,
        last_seen: nowISO,
        suggested_canonical_id: suggestion?.id ?? null,
        suggestion_confidence: suggestion?.confidence ?? null,
        // Preserve any existing confirmed mapping (Catherine's work wins).
        canonical_id: existingAliasCanonical.get(raw) ?? null,
      }
    })
    const stat = emptyStat()
    await upsertBatches(db, "job_type_aliases", payload, "organisation_id,raw_value", stat, dbErrors)
    stats.job_type_aliases.discovered = jobTypeCounts.size
  })

  // Mirror imported caravans into the live `vans` table (customers + historical
  // vehicles are written above). Refreshes non-manually-edited rows; idempotent.
  await safe("sync_imported_vans", dbErrors, async () => {
    const { error } = await db.rpc("sync_imported_vans", { p_org: org })
    if (error) throw error
  })

  const entityStats = [
    stats.customers,
    stats.suppliers,
    stats.stock_items,
    stats.historical_invoices,
    stats.historical_invoice_items,
    stats.historical_quotes,
    stats.historical_quote_items,
    stats.historical_vehicles,
    stats.historical_jobs,
    stats.historical_timesheets,
  ]
  const totals = {
    inserted: entityStats.reduce((a, s) => a + s.inserted, 0),
    updated: entityStats.reduce((a, s) => a + s.updated, 0),
    failed: entityStats.reduce((a, s) => a + s.failed, 0),
  }

  return { stats, parseErrors, dbErrors, skippedFiles, totals }
}
