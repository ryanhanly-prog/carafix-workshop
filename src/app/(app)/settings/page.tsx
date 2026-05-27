import Link from "next/link"
import { Tags, Upload } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"

const items = [
  {
    href: "/settings/job-types",
    title: "Job types",
    description:
      "Map Mechanic Desk's raw job-type labels onto Carafix's canonical types.",
    icon: Tags,
  },
  {
    href: "/imports",
    title: "Imports",
    description: "Import Mechanic Desk export ZIPs (customers, stock, invoices, jobs).",
    icon: Upload,
  },
]

export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <Link key={item.href} href={item.href}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardContent className="flex items-start gap-3 py-5">
                  <Icon className="mt-0.5 size-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
