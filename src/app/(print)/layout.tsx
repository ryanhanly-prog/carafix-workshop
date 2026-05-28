import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

/**
 * Document-first layout for customer / workshop output views. Sibling to
 * (app), so AppShell (sidebar + top-bar + location switcher) is NOT applied —
 * what the user sees is what the customer receives.
 *
 * Auth is enforced primarily by src/proxy.ts (the Next 16 middleware) which
 * redirects unauthenticated requests to /login before this layout runs. The
 * defensive getUser() check below mirrors the same pattern (app)/layout.tsx
 * uses — belt-and-braces for any future change to the proxy matcher.
 *
 * White background / black text is forced regardless of theme so a workshop
 * user in dark mode still sees the customer-facing document the way the
 * customer will receive it.
 */
export default async function PrintLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  return (
    <div className="quote-output-root min-h-screen w-full bg-white text-neutral-900 [color-scheme:light]">
      {children}
    </div>
  )
}
