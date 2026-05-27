import { InsurersView, type InsurerRow } from "@/components/settings/insurers-view"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export default async function InsurersPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("insurers")
    .select("id, name, capped_labour_rate, notes, is_active")
    .order("is_active", { ascending: false })
    .order("name")

  return <InsurersView insurers={(data ?? []) as InsurerRow[]} />
}
