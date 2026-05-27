import {
  JobTypesView,
  type Alias,
  type CanonicalType,
} from "@/components/settings/job-types-view"
import type { JobTypeDefaultRow } from "@/components/settings/job-type-defaults-tab"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export default async function JobTypesPage() {
  const supabase = await createClient()
  const [{ data: types }, { data: aliases }, { data: defaults }] = await Promise.all([
    supabase
      .from("job_type_canonical")
      .select("id, slug, name, category, active, display_order")
      .order("display_order"),
    supabase
      .from("job_type_aliases")
      .select(
        "id, raw_value, canonical_id, occurrence_count, last_seen, suggested_canonical_id, suggestion_confidence"
      ),
    supabase
      .from("job_type_defaults")
      .select(
        "id, canonical_job_type_id, labour_rate_source, workshop_retail_rate, markup_floor_pct, markup_default_pct, notes, job_type_canonical(name, display_order)"
      ),
  ])

  const defaultRows: JobTypeDefaultRow[] = (defaults ?? [])
    .map((d) => {
      const jt = d.job_type_canonical as unknown as { name: string; display_order: number } | null
      return {
        default_id: d.id,
        canonical_name: jt?.name ?? "—",
        labour_rate_source: d.labour_rate_source,
        workshop_retail_rate: d.workshop_retail_rate,
        markup_floor_pct: d.markup_floor_pct,
        markup_default_pct: d.markup_default_pct,
        notes: d.notes,
        _order: jt?.display_order ?? 0,
      }
    })
    .sort((a, b) => a._order - b._order)
    .map(({ _order, ...r }) => {
      void _order
      return r
    })

  return (
    <JobTypesView
      types={(types ?? []) as CanonicalType[]}
      aliases={(aliases ?? []) as Alias[]}
      defaults={defaultRows}
    />
  )
}
