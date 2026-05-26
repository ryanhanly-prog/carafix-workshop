import { SuppliersView, type SupplierRollup } from "@/components/parts/suppliers-view"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export default async function SuppliersPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("v_supplier_rollup")
    .select("supplier_id, name, item_count, avg_markup, last_order_date")
    .order("item_count", { ascending: false })

  return <SuppliersView suppliers={(data ?? []) as SupplierRollup[]} />
}
