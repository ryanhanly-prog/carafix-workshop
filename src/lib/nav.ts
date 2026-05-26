import {
  CalendarDays,
  Columns3,
  Contact,
  LayoutDashboard,
  Package,
  Settings,
  Sparkles,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react"

export type NavItem = {
  title: string
  href: string
  icon: LucideIcon
}

export const navItems: NavItem[] = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Schedule", href: "/schedule", icon: CalendarDays },
  { title: "Kanban", href: "/kanban", icon: Columns3 },
  { title: "Jobs", href: "/jobs", icon: Wrench },
  { title: "Customers", href: "/customers", icon: Contact },
  { title: "Technicians", href: "/technicians", icon: Users },
  { title: "Parts", href: "/parts", icon: Package },
  { title: "Briefing", href: "/briefing", icon: Sparkles },
  { title: "Settings", href: "/settings", icon: Settings },
]
