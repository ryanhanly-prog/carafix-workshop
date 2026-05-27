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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createInsurer, updateInsurer } from "@/lib/actions/insurers"

export type InsurerRow = {
  id: string
  name: string
  capped_labour_rate: number
  notes: string | null
  is_active: boolean | null
}

export function InsurersView({ insurers }: { insurers: InsurerRow[] }) {
  const router = useRouter()
  const [dialog, setDialog] = React.useState<{ open: boolean; insurer: InsurerRow | null }>({
    open: false,
    insurer: null,
  })
  const [name, setName] = React.useState("")
  const [rate, setRate] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [pending, startTransition] = React.useTransition()

  function openCreate() {
    setName("")
    setRate("")
    setNotes("")
    setDialog({ open: true, insurer: null })
  }
  function openEdit(i: InsurerRow) {
    setName(i.name)
    setRate(String(i.capped_labour_rate))
    setNotes(i.notes ?? "")
    setDialog({ open: true, insurer: i })
  }

  function save() {
    const r = Number(rate)
    if (!name.trim()) return toast.error("Name is required")
    if (!(r >= 0)) return toast.error("Enter a valid rate")
    startTransition(async () => {
      const res = dialog.insurer
        ? await updateInsurer(dialog.insurer.id, { name, capped_labour_rate: r, notes })
        : await createInsurer({ name, capped_labour_rate: r, notes })
      if (res.error) {
        toast.error("Save failed", { description: res.error })
        return
      }
      toast.success(dialog.insurer ? "Insurer updated" : "Insurer added")
      setDialog({ open: false, insurer: null })
      router.refresh()
    })
  }

  function toggleActive(i: InsurerRow) {
    startTransition(async () => {
      const res = await updateInsurer(i.id, { is_active: !i.is_active })
      if (res.error) toast.error("Failed", { description: res.error })
      else toast.success(i.is_active ? "Deactivated" : "Reactivated")
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Insurers</h1>
          <p className="text-sm text-muted-foreground">
            Capped labour rates used by insurance job types. Changes are audited.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4" />
          New insurer
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Capped labour rate</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {insurers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                    No insurers yet. Add one — or create one inline when drafting an insurance quote.
                  </TableCell>
                </TableRow>
              ) : (
                insurers.map((i) => (
                  <TableRow key={i.id} className={i.is_active ? "" : "opacity-50"}>
                    <TableCell className="font-medium">{i.name}</TableCell>
                    <TableCell className="text-right">${i.capped_labour_rate}/hr</TableCell>
                    <TableCell className="max-w-[280px] truncate text-muted-foreground">
                      {i.notes ?? "—"}
                    </TableCell>
                    <TableCell>
                      {i.is_active ? (
                        <Badge variant="secondary">Active</Badge>
                      ) : (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(i)} aria-label={`Edit ${i.name}`}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleActive(i)} disabled={pending}>
                          {i.is_active ? "Deactivate" : "Reactivate"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialog.open} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.insurer ? "Edit insurer" : "New insurer"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="mb-1 block text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Capped labour rate ($/hr)</Label>
              <Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="95" />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Notes</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={save} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {dialog.insurer ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
