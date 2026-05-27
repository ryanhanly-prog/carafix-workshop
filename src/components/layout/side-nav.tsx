"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { navItems } from "@/lib/nav"
import { cn } from "@/lib/utils"

export function SideNav({
  onNavigate,
  collapsed = false,
}: {
  onNavigate?: () => void
  collapsed?: boolean
}) {
  const pathname = usePathname()

  return (
    <nav className={cn("flex flex-col gap-1", collapsed ? "p-2" : "p-3")}>
      {navItems.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`)
        const Icon = item.icon

        const link = (
          <Link
            href={item.href}
            onClick={onNavigate}
            aria-label={collapsed ? item.title : undefined}
            className={cn(
              "flex items-center rounded-md text-sm font-medium transition-colors",
              collapsed ? "justify-center px-0 py-2" : "gap-3 px-3 py-2",
              active
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" />
            {!collapsed && item.title}
          </Link>
        )

        if (!collapsed) return <div key={item.href}>{link}</div>

        return (
          <Tooltip key={item.href}>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right">{item.title}</TooltipContent>
          </Tooltip>
        )
      })}
    </nav>
  )
}
