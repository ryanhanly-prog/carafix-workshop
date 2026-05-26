import { PartsTabs } from "@/components/parts/parts-tabs"

export default function PartsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Parts</h1>
      <PartsTabs />
      <div className="pt-1">{children}</div>
    </div>
  )
}
