"use client"

import { useRouter } from "next/navigation"

import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDate } from "@/lib/format"

export type SupplierRollup = {
  supplier_id: string
  name: string
  item_count: number | null
  avg_markup: number | null
  last_order_date: string | null
}

export function SuppliersView({ suppliers }: { suppliers: SupplierRollup[] }) {
  const router = useRouter()

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Suppliers derived from imported stock. Click a supplier to see the parts
        they supply.
      </p>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right"># Items</TableHead>
                <TableHead className="text-right">Avg Markup</TableHead>
                <TableHead>Last Order</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-12 text-center text-muted-foreground">
                    No suppliers yet. Import from Mechanic Desk in Settings → Imports.
                  </TableCell>
                </TableRow>
              ) : (
                suppliers.map((s) => (
                  <TableRow
                    key={s.supplier_id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/parts/catalogue?supplier=${s.supplier_id}`)}
                  >
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-right">{s.item_count ?? 0}</TableCell>
                    <TableCell className="text-right">
                      {s.avg_markup == null ? "—" : `${Math.round(s.avg_markup)}%`}
                    </TableCell>
                    <TableCell>{formatDate(s.last_order_date)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
