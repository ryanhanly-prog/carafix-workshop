import { SuppliersView, type SupplierRow } from "@/components/parts/suppliers-view"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export default async function SuppliersPage() {
  const supabase = await createClient()

  // Full supplier records (for the editable drawer) + the rollup (item count /
  // last order), merged by id. Both are org-scoped by RLS.
  const [{ data: rows }, { data: rollup }] = await Promise.all([
    supabase
      .from("suppliers")
      .select(
        "id, name, primary_contact_name, phone, email, website, address, account_number, payment_terms, notes"
      )
      .order("name"),
    supabase
      .from("v_supplier_rollup")
      .select("supplier_id, item_count, last_order_date"),
  ])

  const rollupById = new Map(
    (rollup ?? []).map((r) => [r.supplier_id, r])
  )

  const suppliers: SupplierRow[] = (rows ?? []).map((s) => {
    const r = rollupById.get(s.id)
    return {
      id: s.id,
      name: s.name,
      primary_contact_name: s.primary_contact_name,
      phone: s.phone,
      email: s.email,
      website: s.website,
      address: s.address,
      account_number: s.account_number,
      payment_terms: s.payment_terms,
      notes: s.notes,
      item_count: r?.item_count ?? 0,
      last_order_date: r?.last_order_date ?? null,
    }
  })

  // Default ordering: most-stocked suppliers first, then alphabetical.
  suppliers.sort((a, b) => b.item_count - a.item_count || a.name.localeCompare(b.name))

  return <SuppliersView suppliers={suppliers} />
}
