"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

const tabs = [
  { href: "/parts", label: "Parts on order" },
  { href: "/parts/catalogue", label: "Catalogue" },
  { href: "/parts/suppliers", label: "Suppliers" },
]

export function PartsTabs() {
  const pathname = usePathname()
  return (
    <div className="border-b">
      <nav className="-mb-px flex gap-6">
        {tabs.map((t) => {
          const active =
            t.href === "/parts" ? pathname === "/parts" : pathname.startsWith(t.href)
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "border-b-2 px-1 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
