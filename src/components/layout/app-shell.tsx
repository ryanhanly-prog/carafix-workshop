"use client"

import { TopBar } from "./top-bar"
import { SideNav } from "./side-nav"
import { LocationProvider, type LocationOption } from "@/lib/location-context"

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
  return (
    <LocationProvider
      locations={locations}
      defaultLocationId={defaultLocationId}
    >
      <div className="flex min-h-svh flex-col">
        <TopBar email={userEmail} />
        <div className="flex flex-1">
          <aside className="hidden w-60 shrink-0 border-r md:block">
            <SideNav />
          </aside>
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </LocationProvider>
  )
}
