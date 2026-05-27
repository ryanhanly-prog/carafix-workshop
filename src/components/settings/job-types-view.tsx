"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Loader2, Pencil, Plus } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  acceptAllSuggestions,
  createCanonical,
  mapAlias,
  mapRemainingToOther,
  updateCanonical,
} from "@/lib/actions/job-types"
import {
  JobTypeDefaultsTab,
  type JobTypeDefaultRow,
} from "@/components/settings/job-type-defaults-tab"
import { formatDate } from "@/lib/format"

export type CanonicalType = {
  id: string
  slug: string
  name: string
  category: string | null
  active: boolean | null
  display_order: number | null
}

export type Alias = {
  id: string
  raw_value: string
  canonical_id: string | null
  occurrence_count: number | null
  last_seen: string | null
  suggested_canonical_id: string | null
  suggestion_confidence: number | null
}

const CATEGORIES = [
  "service",
  "repair",
  "insurance",
  "inspection",
  "warranty",
  "upgrade",
  "other",
]

// ----------------------------- Canonical tab -----------------------------

function CanonicalDialog({
  type,
  open,
  onOpenChange,
  onSaved,
}: {
  type: CanonicalType | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const [name, setName] = React.useState("")
  const [category, setCategory] = React.useState<string>("other")
  const [active, setActive] = React.useState(true)
  const [pending, startTransition] = React.useTransition()

  React.useEffect(() => {
    if (open) {
      setName(type?.name ?? "")
      setCategory(type?.category ?? "other")
      setActive(type?.active ?? true)
    }
  }, [open, type])

  function save() {
    if (!name.trim()) {
      toast.error("Name is required.")
      return
    }
    startTransition(async () => {
      const res = type
        ? await updateCanonical(type.id, { name, category, active })
        : await createCanonical({ name, category })
      if (res.error) {
        toast.error("Could not save", { description: res.error })
        return
      }
      toast.success(type ? "Type updated" : "Type added")
      onSaved()
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{type ? "Edit job type" : "New job type"}</DialogTitle>
          <DialogDescription>
            Canonical types are the clean buckets analytics and AI group work into.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1 block text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {type && (
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={active} onCheckedChange={setActive} />
              Active
            </label>
          )}
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {type ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CanonicalTab({
  types,
  onChanged,
}: {
  types: CanonicalType[]
  onChanged: () => void
}) {
  const [dialog, setDialog] = React.useState<{ open: boolean; type: CanonicalType | null }>({
    open: false,
    type: null,
  })

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setDialog({ open: true, type: null })}>
          <Plus className="size-4" />
          Add type
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {types.map((t) => (
                <TableRow key={t.id} className={t.active ? "" : "opacity-50"}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-muted-foreground">{t.category ?? "—"}</TableCell>
                  <TableCell>
                    {t.active ? (
                      <Badge variant="secondary">Active</Badge>
                    ) : (
                      <Badge variant="outline">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${t.name}`}
                      onClick={() => setDialog({ open: true, type: t })}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <CanonicalDialog
        type={dialog.type}
        open={dialog.open}
        onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
        onSaved={onChanged}
      />
    </div>
  )
}

// ------------------------------ Aliases tab ------------------------------

function AliasesTab({
  types,
  aliases,
  onChanged,
}: {
  types: CanonicalType[]
  aliases: Alias[]
  onChanged: () => void
}) {
  const [pending, startTransition] = React.useTransition()
  const nameById = React.useMemo(
    () => new Map(types.map((t) => [t.id, t.name])),
    [types]
  )
  const activeTypes = types.filter((t) => t.active)

  const unmapped = aliases
    .filter((a) => !a.canonical_id)
    .sort((a, b) => (b.occurrence_count ?? 0) - (a.occurrence_count ?? 0))
  const mapped = aliases.filter((a) => a.canonical_id)

  const totalOccurrences = aliases.reduce((n, a) => n + (a.occurrence_count ?? 0), 0)
  const unmappedOccurrences = unmapped.reduce((n, a) => n + (a.occurrence_count ?? 0), 0)
  const unmappedPct =
    totalOccurrences > 0 ? Math.round((unmappedOccurrences / totalOccurrences) * 100) : 0

  // Group mapped aliases under their canonical type.
  const groups = new Map<string, Alias[]>()
  for (const a of mapped) {
    if (!a.canonical_id) continue
    const list = groups.get(a.canonical_id) ?? []
    list.push(a)
    groups.set(a.canonical_id, list)
  }

  function run(fn: () => Promise<{ error?: string; count?: number }>, label: string) {
    startTransition(async () => {
      const res = await fn()
      if (res.error) {
        toast.error("Action failed", { description: res.error })
        return
      }
      toast.success(label + (res.count != null ? ` (${res.count})` : ""))
      onChanged()
    })
  }

  return (
    <div className="space-y-4">
      {aliases.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No job-type values yet. They appear here after a Mechanic Desk import.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <p className="text-sm">
                <span className="font-semibold">{unmapped.length} unmapped job type{unmapped.length === 1 ? "" : "s"}</span>{" "}
                covering <span className="font-semibold">{unmappedPct}%</span> of historical
                work. Map the top 20 to unlock job-type analytics.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => acceptAllSuggestions(0.7), "Suggestions applied")}
                >
                  Accept all suggestions (&gt;70%)
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => mapRemainingToOther(), "Mapped to Other")}
                >
                  Map remaining to Other
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Unmapped */}
            <Card>
              <CardContent className="p-0">
                <div className="border-b px-4 py-2 text-sm font-medium">
                  Unmapped ({unmapped.length})
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Raw value</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead>Map to</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unmapped.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                          Everything is mapped. 🎉
                        </TableCell>
                      </TableRow>
                    ) : (
                      unmapped.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell>
                            <div className="font-medium">{a.raw_value}</div>
                            {a.suggested_canonical_id ? (
                              <div className="text-xs text-muted-foreground">
                                Suggested: {nameById.get(a.suggested_canonical_id) ?? "?"}
                                {a.suggestion_confidence != null
                                  ? ` (${Math.round(a.suggestion_confidence * 100)}%)`
                                  : ""}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {a.occurrence_count ?? 0}
                          </TableCell>
                          <TableCell>
                            <Select
                              disabled={pending}
                              value={a.suggested_canonical_id ?? undefined}
                              onValueChange={(v) =>
                                run(() => mapAlias(a.id, v), `Mapped "${a.raw_value}"`)
                              }
                            >
                              <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Pick type…" />
                              </SelectTrigger>
                              <SelectContent>
                                {activeTypes.map((t) => (
                                  <SelectItem key={t.id} value={t.id}>
                                    {t.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Mapped */}
            <Card>
              <CardContent className="space-y-4 p-4">
                <div className="text-sm font-medium">Mapped ({mapped.length})</div>
                {groups.size === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing mapped yet.</p>
                ) : (
                  [...groups.entries()]
                    .sort((a, b) =>
                      (nameById.get(a[0]) ?? "").localeCompare(nameById.get(b[0]) ?? "")
                    )
                    .map(([cid, list]) => (
                      <div key={cid}>
                        <div className="mb-1 text-sm font-semibold">
                          {nameById.get(cid) ?? "Unknown"}{" "}
                          <span className="font-normal text-muted-foreground">
                            ({list.length})
                          </span>
                        </div>
                        <ul className="space-y-1">
                          {list.map((a) => (
                            <li
                              key={a.id}
                              className="flex items-center justify-between rounded bg-muted/50 px-2 py-1 text-sm"
                            >
                              <span className="truncate">{a.raw_value}</span>
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => run(() => mapAlias(a.id, null), "Unmapped")}
                                className="text-xs text-muted-foreground hover:text-foreground"
                              >
                                Unmap
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

export function JobTypesView({
  types,
  aliases,
  defaults,
}: {
  types: CanonicalType[]
  aliases: Alias[]
  defaults: JobTypeDefaultRow[]
}) {
  const router = useRouter()
  const onChanged = () => router.refresh()

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Job types</h1>
        <p className="text-sm text-muted-foreground">
          Clean up how Mechanic Desk&apos;s inconsistent job-type labels map onto Carafix&apos;s
          canonical types. This powers job-type analytics and AI quoting.
        </p>
      </div>

      <Tabs defaultValue="aliases">
        <TabsList>
          <TabsTrigger value="aliases">Aliases</TabsTrigger>
          <TabsTrigger value="canonical">Canonical types</TabsTrigger>
          <TabsTrigger value="defaults">Defaults</TabsTrigger>
        </TabsList>
        <TabsContent value="aliases" className="pt-4">
          <AliasesTab types={types} aliases={aliases} onChanged={onChanged} />
        </TabsContent>
        <TabsContent value="canonical" className="pt-4">
          <CanonicalTab types={types} onChanged={onChanged} />
        </TabsContent>
        <TabsContent value="defaults" className="pt-4">
          <JobTypeDefaultsTab rows={defaults} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
