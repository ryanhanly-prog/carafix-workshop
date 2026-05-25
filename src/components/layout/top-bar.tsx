"use client"

import * as React from "react"
import { Menu } from "lucide-react"

import { LocationSwitcher } from "./location-switcher"
import { SideNav } from "./side-nav"
import { UserMenu } from "./user-menu"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

export function TopBar({ email }: { email: string }) {
  const [mobileOpen, setMobileOpen] = React.useState(false)

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background px-4">
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="size-5" />
            <span className="sr-only">Open navigation</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader>
            <SheetTitle>Carafix Workshop</SheetTitle>
            <SheetDescription className="sr-only">
              Workshop navigation
            </SheetDescription>
          </SheetHeader>
          <SideNav onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <span className="text-lg font-semibold tracking-tight">
        Carafix Workshop
      </span>

      <div className="ml-auto flex items-center gap-2">
        <LocationSwitcher />
        <UserMenu email={email} />
      </div>
    </header>
  )
}
