import { ImportView, type ImportBatch } from "@/components/imports/import-view"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export default async function ImportsPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("import_batches")
    .select(
      "id, status, files_uploaded, rows_inserted, rows_updated, rows_failed, uploaded_at, completed_at, error_message"
    )
    .order("uploaded_at", { ascending: false })
    .limit(50)

  return <ImportView batches={(data ?? []) as ImportBatch[]} />
}
