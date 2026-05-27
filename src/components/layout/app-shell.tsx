"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { TopBar } from "./top-bar"
import { SideNav } from "./side-nav"
import { Button } from "@/components/ui/button"
import { LocationProvider, type LocationOption } from "@/lib/location-context"
import { cn } from "@/lib/utils"

export function AppShell({
  locations,
  defaultLocationId,
  userEmail,
  children,
}: {
  locations: LocationOption[]
  defaultLocationId: string | null
  userEmail: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  // Auto-collapse on a quote detail / editor route (but not /quotes/new or the list).
  const m = /^\/quotes\/([^/]+)(\/edit)?$/.exec(pathname)
  const autoCollapse = !!m && m[1] !== "new"
  // null = follow auto; a manual toggle pins the choice for the session.
  const [override, setOverride] = React.useState<boolean | null>(null)
  const collapsed = override ?? autoCollapse

  return (
    <LocationProvider locations={locations} defaultLocationId={defaultLocationId}>
      <div className="flex min-h-svh flex-col">
        <TopBar email={userEmail} />
        <div className="flex flex-1">
          <aside
            className={cn(
              "hidden shrink-0 flex-col border-r transition-[width] duration-200 md:flex",
              collapsed ? "w-16" : "w-60"
            )}
          >
            <div className="flex-1 overflow-y-auto">
              <SideNav collapsed={collapsed} />
            </div>
            <div className="border-t p-2">
              <Button
                variant="ghost"
                size="icon"
                className="w-full"
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                onClick={() => setOverride(!collapsed)}
              >
                {collapsed ? (
                  <ChevronRight className="size-4" />
                ) : (
                  <ChevronLeft className="size-4" />
                )}
              </Button>
            </div>
          </aside>
          <main className="min-w-0 flex-1 p-6">{children}</main>
        </div>
      </div>
    </LocationProvider>
  )
}
