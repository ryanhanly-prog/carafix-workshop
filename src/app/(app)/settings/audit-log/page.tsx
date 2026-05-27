import { AuditLogView, type AuditRow } from "@/components/settings/audit-log-view"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export default async function AuditLogPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("config_audit_log")
    .select("id, entity_type, entity_id, action, changed_fields, changed_at, app_users(full_name)")
    .order("changed_at", { ascending: false })
    .limit(300)

  const rows: AuditRow[] = (data ?? []).map((r) => ({
    id: r.id,
    entity_type: r.entity_type,
    action: r.action,
    changed_fields: r.changed_fields as AuditRow["changed_fields"],
    changed_at: r.changed_at,
    changed_by_name:
      (r.app_users as unknown as { full_name: string } | null)?.full_name ?? null,
  }))

  return <AuditLogView rows={rows} />
}
