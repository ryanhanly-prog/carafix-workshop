import { redirect } from "next/navigation"

import { AppShell } from "@/components/layout/app-shell"
import { createClient } from "@/lib/supabase/server"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Middleware already guards these routes; this is a defensive fallback.
  if (!user) {
    redirect("/login")
  }

  // Org-aware: resolve the user's organisation + preferred location. RLS already
  // scopes every query to this org, but we also filter locations explicitly so
  // the switcher only ever offers this org's sites.
  const { data: profile } = await supabase
    .from("app_users")
    .select("organisation_id, default_location_id")
    .eq("id", user.id)
    .single()

  let locationsQuery = supabase
    .from("locations")
    .select("id, name")
    .eq("active", true)
    .order("name")
  if (profile?.organisation_id) {
    locationsQuery = locationsQuery.eq("organisation_id", profile.organisation_id)
  }
  const { data: locations } = await locationsQuery

  return (
    <AppShell
      locations={locations ?? []}
      defaultLocationId={profile?.default_location_id ?? null}
      userEmail={user.email ?? ""}
    >
      {children}
    </AppShell>
  )
}
