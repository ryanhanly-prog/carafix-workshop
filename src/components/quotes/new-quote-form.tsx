"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import type { SupabaseClient } from "@supabase/supabase-js"
import { Loader2, Plus, X } from "lucide-react"
import { toast } from "sonner"

import { CustomerCombobox, type SelectedCustomer } from "@/components/jobs/customer-combobox"
import { VanCombobox, type SelectedVan } from "@/components/jobs/van-combobox"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
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
import { Textarea } from "@/components/ui/textarea"
import { createInsurer } from "@/lib/actions/insurers"
import { createQuote } from "@/lib/actions/quotes"
import { getBrowserClient } from "@/lib/supabase/browser"

export type JobTypeOption = {
  id: string
  name: string
  labour_rate_source: string | null
  default_damage_tags: string[]
}
type Insurer = { id: string; name: string; capped_labour_rate: number }

function sameSet(a: string[], b: string[]) {
  return a.length === b.length && a.every((x) => b.includes(x))
}

export function NewQuoteForm({
  jobTypes,
  insurers: initialInsurers,
  organisationId,
}: {
  jobTypes: JobTypeOption[]
  insurers: Insurer[]
  organisationId: string
}) {
  const router = useRouter()
  const supabase = getBrowserClient()
  const [customer, setCustomer] = React.useState<SelectedCustomer | null>(null)
  const [van, setVan] = React.useState<SelectedVan | null>(null)
  const [jobTypeId, setJobTypeId] = React.useState<string>("")
  const [insurers, setInsurers] = React.useState<Insurer[]>(initialInsurers)
  const [insurerId, setInsurerId] = React.useState<string>("")
  const [description, setDescription] = React.useState("")
  const [tags, setTags] = React.useState<string[]>([])
  const [tagDraft, setTagDraft] = React.useState("")
  const [pending, startTransition] = React.useTransition()

  // damage-tag auto-suggest state
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set())
  const [descSuggestions, setDescSuggestions] = React.useState<string[]>([])
  const [confirmTags, setConfirmTags] = React.useState<string[] | null>(null) // pending job-type defaults awaiting confirm

  // insurer create dialog
  const [insurerDialog, setInsurerDialog] = React.useState(false)
  const [newInsurerName, setNewInsurerName] = React.useState("")
  const [newInsurerRate, setNewInsurerRate] = React.useState("")
  const [insurerPending, startInsurerTransition] = React.useTransition()

  const selectedType = jobTypes.find((t) => t.id === jobTypeId)
  const needsInsurer = selectedType?.labour_rate_source === "insurer_capped"

  function addTagValue(t: string) {
    if (!t) return
    setTags((prev) => (prev.includes(t) ? prev : [...prev, t]))
    setDismissed((prev) => {
      if (!prev.has(t)) return prev
      const next = new Set(prev)
      next.delete(t)
      return next
    })
  }

  function removeTag(t: string) {
    setTags((prev) => prev.filter((x) => x !== t))
    setDismissed((prev) => new Set(prev).add(t)) // don't auto-re-add a tag the user removed
  }

  function addTag() {
    addTagValue(tagDraft.trim().replace(/,$/, ""))
    setTagDraft("")
  }

  // Layer 1 — job-type default tags. Prefill on pick; confirm before overwriting
  // existing tags when switching to a type with different defaults.
  function onJobTypeChange(id: string) {
    setJobTypeId(id)
    const defaults = jobTypes.find((t) => t.id === id)?.default_damage_tags ?? []
    if (tags.length === 0) {
      setTags(defaults)
      setDismissed(new Set())
    } else if (!sameSet(tags, defaults) && defaults.length > 0) {
      setConfirmTags(defaults)
    }
  }

  // Layer 2 — description-driven suggestions (debounced). Same tokeniser + canonical
  // keyword list as the corpus backfill (single source of truth via rpc).
  React.useEffect(() => {
    const text = description.trim()
    if (text.length < 4) {
      setDescSuggestions([])
      return
    }
    const handle = setTimeout(async () => {
      const looseRpc = supabase as unknown as SupabaseClient
      const { data, error } = await looseRpc.rpc("suggest_damage_tags", {
        p_text: text,
        p_org: organisationId,
      })
      if (error) return
      const suggestions = (data as string[] | null) ?? []
      setDescSuggestions(suggestions)
      // Pre-select: auto-add any new suggestion the user hasn't already removed.
      setTags((prev) => {
        const next = [...prev]
        for (const s of suggestions) if (!next.includes(s) && !dismissed.has(s)) next.push(s)
        return next
      })
    }, 400)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [description])

  function saveInsurer() {
    const rate = Number(newInsurerRate)
    if (!newInsurerName.trim()) {
      toast.error("Insurer name is required")
      return
    }
    if (!(rate >= 0)) {
      toast.error("Enter a valid capped labour rate")
      return
    }
    startInsurerTransition(async () => {
      const res = await createInsurer({ name: newInsurerName, capped_labour_rate: rate })
      if (res.error || !res.id) {
        toast.error("Could not add insurer", { description: res.error })
        return
      }
      const created = { id: res.id, name: newInsurerName.trim(), capped_labour_rate: rate }
      setInsurers((prev) => [...prev, created])
      setInsurerId(created.id)
      setInsurerDialog(false)
      setNewInsurerName("")
      setNewInsurerRate("")
      toast.success("Insurer added")
    })
  }

  function submit() {
    if (!jobTypeId) {
      toast.error("Pick a job type")
      return
    }
    if (needsInsurer && !insurerId) {
      toast.error("This job type needs an insurer (capped labour rate)")
      return
    }
    startTransition(async () => {
      const res = await createQuote({
        customer_id: customer?.id ?? null,
        vehicle_id: van?.id ?? null,
        canonical_job_type_id: jobTypeId,
        insurer_id: needsInsurer ? insurerId : null,
        description,
        damage_tags: tags,
      })
      if (res.error || !res.id) {
        toast.error("Could not create quote", { description: res.error })
        return
      }
      router.push(`/quotes/${res.id}/edit`)
    })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">New quote</h1>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-1">
            <Label>Customer</Label>
            <CustomerCombobox
              value={customer}
              onSelect={(c) => {
                setCustomer(c)
                setVan(null)
              }}
            />
          </div>

          <div className="space-y-1">
            <Label>Vehicle</Label>
            <VanCombobox customerId={customer?.id ?? null} value={van} onSelect={setVan} />
          </div>

          <div className="space-y-1">
            <Label>Job type</Label>
            <Select value={jobTypeId} onValueChange={onJobTypeChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select job type…" />
              </SelectTrigger>
              <SelectContent>
                {jobTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {needsInsurer && (
            <div className="space-y-1">
              <Label>Insurer (capped labour rate)</Label>
              <div className="flex gap-2">
                <Select value={insurerId} onValueChange={setInsurerId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select insurer…" />
                  </SelectTrigger>
                  <SelectContent>
                    {insurers.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name} (${i.capped_labour_rate}/hr)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" onClick={() => setInsurerDialog(true)}>
                  + New
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's the job? Used to find similar past quotes."
            />
          </div>

          <div className="space-y-1">
            <Label>Damage tags</Label>
            <div className="flex flex-wrap items-center gap-2 rounded-md border p-2">
              {tags.map((t) => (
                <Badge key={t} variant="secondary" className="gap-1">
                  {t}
                  <button type="button" onClick={() => removeTag(t)} aria-label={`Remove ${t}`}>
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
              <input
                className="flex-1 bg-transparent text-sm outline-none"
                placeholder="Type a tag, Enter to add"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault()
                    addTag()
                  }
                }}
                onBlur={addTag}
              />
            </div>
            {descSuggestions.filter((s) => !tags.includes(s)).length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-xs text-muted-foreground">Suggested from description:</span>
                {descSuggestions
                  .filter((s) => !tags.includes(s))
                  .map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => addTagValue(s)}
                      className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-800 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200"
                    >
                      <Plus className="size-3" />
                      {s}
                    </button>
                  ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => router.push("/quotes")}>
              Cancel
            </Button>
            <Button type="button" onClick={submit} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Create draft
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={insurerDialog} onOpenChange={setInsurerDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New insurer</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="mb-1 block text-xs">Name</Label>
              <Input value={newInsurerName} onChange={(e) => setNewInsurerName(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Capped labour rate ($/hr)</Label>
              <Input
                inputMode="decimal"
                value={newInsurerRate}
                onChange={(e) => setNewInsurerRate(e.target.value)}
                placeholder="95"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={saveInsurer} disabled={insurerPending}>
              {insurerPending && <Loader2 className="size-4 animate-spin" />}
              Add insurer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmTags !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmTags(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace damage tags with defaults for the new job type?</AlertDialogTitle>
            <AlertDialogDescription>
              Your current damage tags will be replaced with the defaults for this job type.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmTags(null)}>Keep mine</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmTags) {
                  setTags(confirmTags)
                  setDismissed(new Set())
                }
                setConfirmTags(null)
              }}
            >
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
