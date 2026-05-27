import {
  JobTypesView,
  type Alias,
  type CanonicalType,
} from "@/components/settings/job-types-view"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export default async function JobTypesPage() {
  const supabase = await createClient()
  const [{ data: types }, { data: aliases }] = await Promise.all([
    supabase
      .from("job_type_canonical")
      .select("id, slug, name, category, active, display_order")
      .order("display_order"),
    supabase
      .from("job_type_aliases")
      .select(
        "id, raw_value, canonical_id, occurrence_count, last_seen, suggested_canonical_id, suggestion_confidence"
      ),
  ])

  return (
    <JobTypesView
      types={(types ?? []) as CanonicalType[]}
      aliases={(aliases ?? []) as Alias[]}
    />
  )
}
