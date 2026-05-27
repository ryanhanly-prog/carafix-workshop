import { NewQuoteForm, type JobTypeOption } from "@/components/quotes/new-quote-form"
import { getCurrentOrgId } from "@/lib/actions/org"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export default async function NewQuotePage() {
  const supabase = await createClient()
  const organisationId = (await getCurrentOrgId(supabase)) ?? ""
  const [{ data: types }, { data: defaults }, { data: insurers }] = await Promise.all([
    supabase
      .from("job_type_canonical")
      .select("id, name, category, default_damage_tags")
      .eq("active", true)
      .order("display_order"),
    supabase.from("job_type_defaults").select("canonical_job_type_id, labour_rate_source"),
    supabase
      .from("insurers")
      .select("id, name, capped_labour_rate")
      .eq("is_active", true)
      .order("name"),
  ])

  const sourceByType = new Map(
    (defaults ?? []).map((d) => [d.canonical_job_type_id, d.labour_rate_source])
  )
  const jobTypes: JobTypeOption[] = (types ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    labour_rate_source: sourceByType.get(t.id) ?? null,
    default_damage_tags: t.default_damage_tags ?? [],
  }))

  return (
    <NewQuoteForm
      jobTypes={jobTypes}
      insurers={(insurers ?? []) as { id: string; name: string; capped_labour_rate: number }[]}
      organisationId={organisationId}
    />
  )
}
