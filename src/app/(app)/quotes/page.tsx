import { QuotesView, type QuoteRow } from "@/components/quotes/quotes-view"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export default async function QuotesPage() {
  const supabase = await createClient()
  const [{ data: quotes }, { data: types }, { data: insurers }] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        "id, quote_number, status, total, created_at, description, customers(name), vans(make, model, rego), job_type_canonical(name), insurers(name)"
      )
      .order("created_at", { ascending: false }),
    supabase.from("job_type_canonical").select("id, name").order("display_order"),
    supabase.from("insurers").select("id, name").eq("is_active", true).order("name"),
  ])

  return (
    <QuotesView
      quotes={(quotes ?? []) as unknown as QuoteRow[]}
      jobTypes={(types ?? []) as { id: string; name: string }[]}
      insurers={(insurers ?? []) as { id: string; name: string }[]}
    />
  )
}
