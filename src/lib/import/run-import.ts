// Import orchestrator.
//
// Pure of any Next.js / request concerns: give it a Supabase client (user-scoped
// in the app, service-role in the self-test), an organisation id, and the set of
// CSV files pulled out of one or more Mechanic Desk export ZIPs. It parses,
// de-duplicates across files, and writes everything in dependency order with
// idempotent upserts.
//
// Idempotency:
//  - customers / stock_items / suppliers / invoices / quotes upsert on their
//    org-scoped natural key, so a re-import updates rather than duplicates.
//  - invoice/quote LINE ITEMS have no stable id in the source, so they are
//    replaced: existing rows for the affected parent numbers are deleted, then
//    re-inserted. They are counted as "updated" when their parent already
//    existed, "inserted" otherwise.

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/database.types"
import {
  KNOWN_CSV_FILES,
  parseCustomers,
  parseInvoiceItems,
  parseInvoicesSummary,
  parseQuoteItems,
  parseQuotes,
  parseStocks,
  type ParseError,
  type StockRow,
} from "@/lib/import/mechanic-desk"

type DB = SupabaseClient<Database>

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
}
export type ImportResult = {
  stats: ImportStats
  parseErrors: ParseError[]
  dbErrors: string[]
  totals: { inserted: number; updated: number; failed: number }
}

export type ImportFile = { name: string; content: string }

const BATCH = 500

function emptyStat(): EntityStat {
  return { inserted: 0, updated: 0, failed: 0 }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// Collect every CSV of a given kind across all supplied files (export ZIPs can
// repeat e.g. Stocks.csv); returns the concatenated text bodies.
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

// Page through a single column for the whole org (PostgREST caps a select at
// 1000 rows, so we range-paginate).
async function fetchExistingKeys(
  supabase: DB,
  table: string,
  org: string,
  col: string
): Promise<Set<string>> {
  const keys = new Set<string>()
  const page = 1000
  // Order is REQUIRED: range pagination without a stable sort can return
  // overlapping/missing rows across pages, which would silently corrupt the
  // existing-key set and break idempotency.
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from(table)
      .select(col)
      .eq("organisation_id", org)
      .order(col, { ascending: true })
      .range(from, from + page - 1)
    if (error) throw new Error(`fetch existing ${table}.${col}: ${error.message}`)
    if (!data || data.length === 0) break
    for (const r of data as Record<string, string | null>[]) {
      const v = r[col]
      if (v != null) keys.add(v)
    }
    if (data.length < page) break
  }
  return keys
}

async function fetchKeyIdMap(
  supabase: DB,
  table: string,
  org: string,
  keyCol: string
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const page = 1000
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from(table)
      .select(`id, ${keyCol}`)
      .eq("organisation_id", org)
      .order("id", { ascending: true })
      .range(from, from + page - 1)
    if (error) throw new Error(`fetch id map ${table}: ${error.message}`)
    if (!data || data.length === 0) break
    for (const r of data as Record<string, string>[]) {
      if (r[keyCol] != null) map.set(r[keyCol], r.id)
    }
    if (data.length < page) break
  }
  return map
}

async function upsertBatches(
  supabase: DB,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
  stat: EntityStat,
  dbErrors: string[]
) {
  for (const c of chunk(rows, BATCH)) {
    const { error } = await supabase.from(table).upsert(c, { onConflict, ignoreDuplicates: false })
    if (error) {
      stat.failed += c.length
      stat.inserted = Math.max(0, stat.inserted - c.length) // it didn't actually land
      dbErrors.push(`upsert ${table}: ${error.message}`)
    }
  }
}

async function insertBatches(
  supabase: DB,
  table: string,
  rows: Record<string, unknown>[],
  dbErrors: string[]
): Promise<number> {
  let failed = 0
  for (const c of chunk(rows, BATCH)) {
    const { error } = await supabase.from(table).insert(c)
    if (error) {
      failed += c.length
      dbErrors.push(`insert ${table}: ${error.message}`)
    }
  }
  return failed
}

export async function runImport(
  supabase: DB,
  organisationId: string,
  files: ImportFile[]
): Promise<ImportResult> {
  const org = organisationId
  const stats: ImportStats = {
    customers: emptyStat(),
    suppliers: emptyStat(),
    stock_items: emptyStat(),
    stock_item_suppliers: { linked: 0 },
    historical_invoices: emptyStat(),
    historical_invoice_items: emptyStat(),
    historical_quotes: emptyStat(),
    historical_quote_items: emptyStat(),
  }
  const parseErrors: ParseError[] = []
  const dbErrors: string[] = []
  const countSkips = (errs: ParseError[]) =>
    errs.filter((e) => e.message.includes("skipped")).length

  // ---------------- Customers ----------------
  {
    const dedup = new Map<string, ReturnType<typeof parseCustomers>["rows"][number]["row"]>()
    let skipped = 0
    for (const csv of filesOfKind(files, "customers")) {
      const res = parseCustomers(csv)
      parseErrors.push(...res.errors)
      skipped += countSkips(res.errors)
      for (const { row } of res.rows) {
        const key = row.external_id ?? `name:${row.name}`
        dedup.set(key, row)
      }
    }
    const rows = [...dedup.values()]
    const existing = await fetchExistingKeys(supabase, "customers", org, "external_id")
    let inserted = 0
    let updated = 0
    const payload = rows.map((r) => {
      if (r.external_id && existing.has(r.external_id)) updated++
      else inserted++
      return { ...r, organisation_id: org }
    })
    stats.customers = { inserted, updated, failed: skipped }
    await upsertBatches(supabase, "customers", payload, "organisation_id,external_id", stats.customers, dbErrors)
  }

  // ---------------- Suppliers + Stock items ----------------
  const stockRows: StockRow[] = []
  {
    const dedup = new Map<string, StockRow>()
    let skipped = 0
    for (const csv of filesOfKind(files, "stocks")) {
      const res = parseStocks(csv)
      parseErrors.push(...res.errors)
      skipped += countSkips(res.errors)
      for (const { row } of res.rows) {
        const key = row.external_id ?? `sn:${row.stock_number}`
        dedup.set(key, row) // last wins across duplicate Stocks.csv
      }
    }
    stockRows.push(...dedup.values())

    // Suppliers first (referenced by the link table).
    const supplierNames = new Set<string>()
    for (const s of stockRows) for (const n of s.suppliers) supplierNames.add(n)
    const existingSuppliers = await fetchExistingKeys(supabase, "suppliers", org, "name")
    let sInserted = 0
    let sUpdated = 0
    const supplierPayload = [...supplierNames].map((name) => {
      if (existingSuppliers.has(name)) sUpdated++
      else sInserted++
      return { name, organisation_id: org }
    })
    stats.suppliers = { inserted: sInserted, updated: sUpdated, failed: 0 }
    await upsertBatches(supabase, "suppliers", supplierPayload, "organisation_id,name", stats.suppliers, dbErrors)

    // Stock items.
    const existingStock = await fetchExistingKeys(supabase, "stock_items", org, "external_id")
    let inserted = 0
    let updated = 0
    const stockPayload = stockRows.map((r) => {
      if (r.external_id && existingStock.has(r.external_id)) updated++
      else inserted++
      // strip relationship-only fields before insert
      const { suppliers: _s, first_supplier_stock_number: _f, ...cols } = r
      void _s
      void _f
      return { ...cols, organisation_id: org }
    })
    stats.stock_items = { inserted, updated, failed: skipped }
    await upsertBatches(supabase, "stock_items", stockPayload, "organisation_id,external_id", stats.stock_items, dbErrors)

    // Link stock <-> suppliers.
    const supplierMap = await fetchKeyIdMap(supabase, "suppliers", org, "name")
    const stockMap = await fetchKeyIdMap(supabase, "stock_items", org, "external_id")
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
      const { error } = await supabase
        .from("stock_item_suppliers")
        .upsert(c, { onConflict: "stock_item_id,supplier_id", ignoreDuplicates: true })
      if (error) dbErrors.push(`upsert stock_item_suppliers: ${error.message}`)
      else stats.stock_item_suppliers.linked += c.length
    }
  }

  // ---------------- Invoices + items ----------------
  {
    const dedup = new Map<string, ReturnType<typeof parseInvoicesSummary>["rows"][number]["row"]>()
    let skipped = 0
    for (const csv of filesOfKind(files, "invoices")) {
      const res = parseInvoicesSummary(csv)
      parseErrors.push(...res.errors)
      skipped += countSkips(res.errors)
      for (const { row } of res.rows) dedup.set(row.invoice_number, row)
    }
    const rows = [...dedup.values()]
    const existing = await fetchExistingKeys(supabase, "historical_invoices", org, "invoice_number")
    let inserted = 0
    let updated = 0
    const payload = rows.map((r) => {
      if (existing.has(r.invoice_number)) updated++
      else inserted++
      return { ...r, organisation_id: org }
    })
    stats.historical_invoices = { inserted, updated, failed: skipped }
    await upsertBatches(supabase, "historical_invoices", payload, "organisation_id,invoice_number", stats.historical_invoices, dbErrors)

    // Items: resolve parent id, replace by parent number.
    const invoiceMap = await fetchKeyIdMap(supabase, "historical_invoices", org, "invoice_number")
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
      const { error } = await supabase
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
    const failed = await insertBatches(supabase, "historical_invoice_items", itemPayload, dbErrors)
    stats.historical_invoice_items = { inserted: iInserted, updated: iUpdated, failed: itemSkips + failed }
  }

  // ---------------- Quotes + items ----------------
  {
    const dedup = new Map<string, ReturnType<typeof parseQuotes>["rows"][number]["row"]>()
    let skipped = 0
    for (const csv of filesOfKind(files, "quotes")) {
      const res = parseQuotes(csv)
      parseErrors.push(...res.errors)
      skipped += countSkips(res.errors)
      for (const { row } of res.rows) dedup.set(row.quote_number, row)
    }
    const rows = [...dedup.values()]
    const existing = await fetchExistingKeys(supabase, "historical_quotes", org, "quote_number")
    let inserted = 0
    let updated = 0
    const payload = rows.map((r) => {
      if (existing.has(r.quote_number)) updated++
      else inserted++
      return { ...r, organisation_id: org }
    })
    stats.historical_quotes = { inserted, updated, failed: skipped }
    await upsertBatches(supabase, "historical_quotes", payload, "organisation_id,quote_number", stats.historical_quotes, dbErrors)

    const quoteMap = await fetchKeyIdMap(supabase, "historical_quotes", org, "quote_number")
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
      const { error } = await supabase
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
    const failed = await insertBatches(supabase, "historical_quote_items", itemPayload, dbErrors)
    stats.historical_quote_items = { inserted: qInserted, updated: qUpdated, failed: itemSkips + failed }
  }

  const entityStats = [
    stats.customers,
    stats.suppliers,
    stats.stock_items,
    stats.historical_invoices,
    stats.historical_invoice_items,
    stats.historical_quotes,
    stats.historical_quote_items,
  ]
  const totals = {
    inserted: entityStats.reduce((a, s) => a + s.inserted, 0),
    updated: entityStats.reduce((a, s) => a + s.updated, 0),
    failed: entityStats.reduce((a, s) => a + s.failed, 0),
  }

  return { stats, parseErrors, dbErrors, totals }
}
