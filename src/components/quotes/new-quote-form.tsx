"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Loader2, X } from "lucide-react"
import { toast } from "sonner"

import { CustomerCombobox, type SelectedCustomer } from "@/components/jobs/customer-combobox"
import { VanCombobox, type SelectedVan } from "@/components/jobs/van-combobox"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
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

export type JobTypeOption = { id: string; name: string; labour_rate_source: string | null }
type Insurer = { id: string; name: string; capped_labour_rate: number }

export function NewQuoteForm({
  jobTypes,
  insurers: initialInsurers,
}: {
  jobTypes: JobTypeOption[]
  insurers: Insurer[]
}) {
  const router = useRouter()
  const [customer, setCustomer] = React.useState<SelectedCustomer | null>(null)
  const [van, setVan] = React.useState<SelectedVan | null>(null)
  const [jobTypeId, setJobTypeId] = React.useState<string>("")
  const [insurers, setInsurers] = React.useState<Insurer[]>(initialInsurers)
  const [insurerId, setInsurerId] = React.useState<string>("")
  const [description, setDescription] = React.useState("")
  const [tags, setTags] = React.useState<string[]>([])
  const [tagDraft, setTagDraft] = React.useState("")
  const [pending, startTransition] = React.useTransition()

  // insurer create dialog
  const [insurerDialog, setInsurerDialog] = React.useState(false)
  const [newInsurerName, setNewInsurerName] = React.useState("")
  const [newInsurerRate, setNewInsurerRate] = React.useState("")
  const [insurerPending, startInsurerTransition] = React.useTransition()

  const selectedType = jobTypes.find((t) => t.id === jobTypeId)
  const needsInsurer = selectedType?.labour_rate_source === "insurer_capped"

  function addTag() {
    const t = tagDraft.trim().replace(/,$/, "")
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t])
    setTagDraft("")
  }

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
            <Select value={jobTypeId} onValueChange={setJobTypeId}>
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
                  <button type="button" onClick={() => setTags((prev) => prev.filter((x) => x !== t))}>
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
    </div>
  )
}
