import { format, subYears } from "date-fns"

import { CatalogueView, type CatalogueItem } from "@/components/parts/catalogue-view"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 50
const COLUMNS =
  "id, external_id, stock_number, name, description, category, brand, model, sell_price, buy_price, markup_percentage, available, quantity, allocated, ordered, unit_of_measure, bin_location, last_sales_date, last_purchase_date, is_non_stock, deactivated, tags"

type SP = Record<string, string | string[] | undefined>

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? ""
}

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<SP>
}) {
  const sp = await searchParams
  const page = Math.max(1, parseInt(one(sp.page), 10) || 1)
  const q = one(sp.q).trim()
  const category = one(sp.category)
  const hasStock = one(sp.hasStock) === "1"
  const soldRecently = one(sp.sold) === "1"
  const supplier = one(sp.supplier)

  const supabase = await createClient()

  // Resolve the supplier filter to a set of stock item ids (read-only v1: a
  // supplier rarely has more than a few hundred items).
  let supplierName = ""
  let supplierItemIds: string[] | null = null
  if (supplier) {
    const [{ data: links }, { data: sup }] = await Promise.all([
      supabase.from("stock_item_suppliers").select("stock_item_id").eq("supplier_id", supplier),
      supabase.from("suppliers").select("name").eq("id", supplier).single(),
    ])
    supplierItemIds = (links ?? []).map((l) => l.stock_item_id).filter((id): id is string => !!id)
    supplierName = sup?.name ?? ""
    if (supplierItemIds.length === 0) {
      // Sentinel so the query returns nothing rather than everything.
      supplierItemIds = ["00000000-0000-0000-0000-000000000000"]
    }
  }

  let query = supabase.from("stock_items").select(COLUMNS, { count: "exact" })

  if (q) {
    // Strip characters that have meaning in PostgREST's or() filter grammar so
    // user input can't alter the query shape.
    const safe = q.replace(/[%,()*\\]/g, " ").trim()
    if (safe) {
      query = query.or(
        `stock_number.ilike.%${safe}%,name.ilike.%${safe}%,brand.ilike.%${safe}%`
      )
    }
  }
  if (category) query = query.eq("category", category)
  if (hasStock) query = query.gt("available", 0)
  if (soldRecently) {
    query = query.gte("last_sales_date", format(subYears(new Date(), 1), "yyyy-MM-dd"))
  }
  if (supplierItemIds) query = query.in("id", supplierItemIds)

  query = query
    .order("last_sales_date", { ascending: false, nullsFirst: false })
    .order("stock_number", { ascending: true })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  const { data, count } = await query

  const { data: cats } = await supabase
    .from("v_stock_categories")
    .select("category")
    .order("category")

  return (
    <CatalogueView
      items={(data ?? []) as CatalogueItem[]}
      totalCount={count ?? 0}
      page={page}
      pageSize={PAGE_SIZE}
      categories={(cats ?? []).map((c) => c.category).filter((c): c is string => !!c)}
      filters={{ q, category, hasStock, soldRecently, supplier, supplierName }}
    />
  )
}
