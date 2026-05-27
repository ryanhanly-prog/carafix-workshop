"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDate } from "@/lib/format"
import { getBrowserClient } from "@/lib/supabase/browser"
import { cn } from "@/lib/utils"

export type CatalogueItem = {
  id: string
  external_id: string | null
  stock_number: string
  name: string
  description: string | null
  category: string | null
  brand: string | null
  model: string | null
  sell_price: number | null
  buy_price: number | null
  markup_percentage: number | null
  available: number | null
  quantity: number | null
  allocated: number | null
  ordered: number | null
  unit_of_measure: string | null
  bin_location: string | null
  last_sales_date: string | null
  last_purchase_date: string | null
  is_non_stock: boolean | null
  deactivated: boolean | null
  tags: string | null
}

const ALL = "__all__"

function money(n: number | null | undefined) {
  if (n == null) return "—"
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n)
}

function pct(n: number | null | undefined) {
  return n == null ? "—" : `${Math.round(n)}%`
}

type SupplierLink = { name: string; is_primary: boolean; supplier_stock_number: string | null }

function DetailDrawer({
  item,
  onClose,
}: {
  item: CatalogueItem | null
  onClose: () => void
}) {
  const [suppliers, setSuppliers] = React.useState<SupplierLink[]>([])
  const [usedCount, setUsedCount] = React.useState<number | null>(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!item) return
    let cancelled = false
    setLoading(true)
    setSuppliers([])
    setUsedCount(null)
    const supabase = getBrowserClient()
    ;(async () => {
      const [{ data: links }, { count }] = await Promise.all([
        supabase
          .from("stock_item_suppliers")
          .select("is_primary, supplier_stock_number, suppliers(name)")
          .eq("stock_item_id", item.id),
        supabase
          .from("historical_invoice_items")
          .select("id", { count: "exact", head: true })
          .eq("stock_number", item.stock_number),
      ])
      if (cancelled) return
      setSuppliers(
        (links ?? []).map((l) => ({
          name:
            (l.suppliers as unknown as { name: string } | null)?.name ?? "—",
          is_primary: l.is_primary ?? false,
          supplier_stock_number: l.supplier_stock_number,
        }))
      )
      setUsedCount(count ?? 0)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [item])

  return (
    <Sheet open={!!item} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {item && (
          <>
            <SheetHeader>
              <SheetTitle className="pr-6">{item.name}</SheetTitle>
              <SheetDescription>
                {item.stock_number}
                {item.is_non_stock && (
                  <Badge variant="secondary" className="ml-2">
                    Non-stock
                  </Badge>
                )}
                {item.deactivated && (
                  <Badge variant="outline" className="ml-2">
                    Deactivated
                  </Badge>
                )}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-5 px-4 pb-8 text-sm">
              {item.description && (
                <p className="text-muted-foreground">{item.description}</p>
              )}

              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                <Field label="Category" value={item.category} />
                <Field label="Brand" value={item.brand} />
                <Field label="Model" value={item.model} />
                <Field label="Unit" value={item.unit_of_measure} />
                <Field label="Sell price" value={money(item.sell_price)} />
                <Field label="Buy price" value={money(item.buy_price)} />
                <Field label="Margin" value={pct(item.markup_percentage)} />
                <Field label="Bin" value={item.bin_location} />
                <Field label="Available" value={item.available ?? "—"} />
                <Field label="On hand" value={item.quantity ?? "—"} />
                <Field label="Allocated" value={item.allocated ?? "—"} />
                <Field label="On order" value={item.ordered ?? "—"} />
                <Field label="Last sold" value={formatDate(item.last_sales_date)} />
                <Field label="Last purchased" value={formatDate(item.last_purchase_date)} />
              </dl>

              <div>
                <p className="mb-1 font-medium">Suppliers</p>
                {loading ? (
                  <p className="text-muted-foreground">Loading…</p>
                ) : suppliers.length === 0 ? (
                  <p className="text-muted-foreground">None recorded.</p>
                ) : (
                  <ul className="space-y-1">
                    {suppliers.map((s, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span>{s.name}</span>
                        {s.is_primary && (
                          <Badge variant="secondary" className="text-[10px]">
                            primary
                          </Badge>
                        )}
                        {s.supplier_stock_number && (
                          <span className="text-xs text-muted-foreground">
                            #{s.supplier_stock_number}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <p className="mb-1 font-medium">Used in jobs</p>
                <p className="text-muted-foreground">
                  {loading
                    ? "Loading…"
                    : `${(usedCount ?? 0).toLocaleString()} historical invoice line item${
                        usedCount === 1 ? "" : "s"
                      }`}
                </p>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  )
}

export function CatalogueView({
  items,
  totalCount,
  page,
  pageSize,
  categories,
  filters,
}: {
  items: CatalogueItem[]
  totalCount: number
  page: number
  pageSize: number
  categories: string[]
  filters: {
    q: string
    category: string
    hasStock: boolean
    soldRecently: boolean
    supplier: string
    supplierName: string
  }
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = React.useTransition()
  const [selected, setSelected] = React.useState<CatalogueItem | null>(null)
  const [search, setSearch] = React.useState(filters.q)

  const update = React.useCallback(
    (changes: Record<string, string | null>, resetPage = true) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [k, v] of Object.entries(changes)) {
        if (v == null || v === "") params.delete(k)
        else params.set(k, v)
      }
      if (resetPage) params.delete("page")
      startTransition(() => router.push(`${pathname}?${params.toString()}`))
    },
    [router, pathname, searchParams]
  )

  // Debounce free-text search into the URL.
  React.useEffect(() => {
    if (search === filters.q) return
    const t = setTimeout(() => update({ q: search || null }), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalCount)
  const lastPage = Math.max(1, Math.ceil(totalCount / pageSize))

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Stock catalogue imported from Mechanic Desk. Read-only — data flows in via
        Settings → Imports.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search stock #, name or brand…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={filters.category || ALL}
          onValueChange={(v) => update({ category: v === ALL ? null : v })}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={filters.hasStock}
            onCheckedChange={(v) => update({ hasStock: v ? "1" : null })}
          />
          Has stock
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={filters.soldRecently}
            onCheckedChange={(v) => update({ sold: v ? "1" : null })}
          />
          Sold in last 12 months
        </label>
      </div>

      {filters.supplier && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            Supplier: {filters.supplierName || filters.supplier}
            <button onClick={() => update({ supplier: null })} aria-label="Clear supplier filter">
              <X className="size-3" />
            </button>
          </Badge>
        </div>
      )}

      <Card>
        <CardContent
          className={cn("overflow-x-auto p-0 transition-opacity", pending && "opacity-50")}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stock #</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead className="text-right">Sell</TableHead>
                <TableHead className="text-right">Buy</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead>Last Sold</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
                    No parts in catalogue yet. Import from Mechanic Desk in Settings → Imports.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((it) => (
                  <TableRow
                    key={it.id}
                    className="cursor-pointer"
                    onClick={() => setSelected(it)}
                  >
                    <TableCell className="font-medium">{it.stock_number}</TableCell>
                    <TableCell className="max-w-[280px] truncate">{it.name}</TableCell>
                    <TableCell>{it.category ?? "—"}</TableCell>
                    <TableCell>{it.brand ?? "—"}</TableCell>
                    <TableCell className="text-right">{money(it.sell_price)}</TableCell>
                    <TableCell className="text-right">{money(it.buy_price)}</TableCell>
                    <TableCell className="text-right">{pct(it.markup_percentage)}</TableCell>
                    <TableCell className="text-right">{it.available ?? "—"}</TableCell>
                    <TableCell>{formatDate(it.last_sales_date)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {from}–{to} of {totalCount.toLocaleString()}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || pending}
            onClick={() => update({ page: String(page - 1) }, false)}
          >
            Previous
          </Button>
          <span>
            Page {page} of {lastPage}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= lastPage || pending}
            onClick={() => update({ page: String(page + 1) }, false)}
          >
            Next
          </Button>
        </div>
      </div>

      <DetailDrawer item={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
