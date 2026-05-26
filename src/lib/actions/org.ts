import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/database.types"

/**
 * Resolve the organisation_id of the currently authenticated user.
 *
 * Inserts into org-scoped tables must set organisation_id explicitly (the column
 * is NOT NULL and the RLS WITH CHECK requires it to equal current_user_org_id()).
 * Returns null if there is no signed-in user / no profile.
 */
export async function getCurrentOrgId(
  supabase: SupabaseClient<Database>
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from("app_users")
    .select("organisation_id")
    .eq("id", user.id)
    .single()
  return data?.organisation_id ?? null
}
