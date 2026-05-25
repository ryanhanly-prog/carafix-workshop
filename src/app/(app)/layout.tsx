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

  const { data: locations } = await supabase
    .from("locations")
    .select("id, name")
    .eq("active", true)
    .order("name")

  return (
    <AppShell
      locations={locations ?? []}
      defaultLocationId={null}
      userEmail={user.email ?? ""}
    >
      {children}
    </AppShell>
  )
}
