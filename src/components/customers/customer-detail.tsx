"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, Pencil } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { StatusBadge } from "@/components/jobs/badges"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { updateVan } from "@/lib/actions/vans"
import { formatDate } from "@/lib/format"
import { useCustomer } from "@/lib/queries"

type VanRow = {
  id: string
  make: string | null
  model: string | null
  year: number | null
  rego: string | null
  notes: string | null
}

function EditVanDialog({
  van,
  open,
  onOpenChange,
  onSaved,
}: {
  van: VanRow | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const [make, setMake] = React.useState("")
  const [model, setModel] = React.useState("")
  const [year, setYear] = React.useState("")
  const [rego, setRego] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [pending, startTransition] = React.useTransition()

  React.useEffect(() => {
    if (open && van) {
      setMake(van.make ?? "")
      setModel(van.model ?? "")
      setYear(van.year?.toString() ?? "")
      setRego(van.rego ?? "")
      setNotes(van.notes ?? "")
    }
  }, [open, van])

  function save() {
    if (!van) return
    startTransition(async () => {
      const res = await updateVan(van.id, {
        make,
        model,
        year: year.trim() === "" ? null : Number(year),
        rego,
        notes,
      })
      if (res.error) {
        toast.error("Could not save van", { description: res.error })
        return
      }
      toast.success("Van updated")
      onSaved()
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit van</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1 block text-xs">Make</Label>
              <Input value={make} onChange={(e) => setMake(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Model</Label>
              <Input value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Year</Label>
              <Input inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Rego</Label>
              <Input value={rego} onChange={(e) => setRego(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CustomerDetail({ customerId }: { customerId: string }) {
  const { data, isLoading, isError } = useCustomer(customerId)
  const queryClient = useQueryClient()
  const [editVan, setEditVan] = React.useState<VanRow | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />
  }
  if (isError || !data) {
    return (
      <div className="space-y-3">
        <p className="text-muted-foreground">Customer not found.</p>
        <Button asChild variant="outline">
          <Link href="/customers">
            <ArrowLeft className="size-4" /> Back to customers
          </Link>
        </Button>
      </div>
    )
  }

  const { customer, vans, jobs } = data

  function openEdit(v: VanRow) {
    setEditVan(v)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/customers">
            <ArrowLeft className="size-4" /> Customers
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">{customer.name}</h1>
        <p className="text-muted-foreground">
          {[customer.phone, customer.email].filter(Boolean).join(" · ") || "—"}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vans ({vans.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Make</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Rego</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {vans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    No vans on record.
                  </TableCell>
                </TableRow>
              ) : (
                vans.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>{v.make ?? "—"}</TableCell>
                    <TableCell>{v.model ?? "—"}</TableCell>
                    <TableCell>{v.year ?? "—"}</TableCell>
                    <TableCell>{v.rego ?? "—"}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Edit van"
                        onClick={() => openEdit(v as VanRow)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Job history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job #</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Job start</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                    No jobs yet.
                  </TableCell>
                </TableRow>
              ) : (
                jobs.map((j) => (
                  <TableRow key={j.id} className="cursor-pointer">
                    <TableCell className="font-medium">
                      <Link href={`/jobs/${j.id}`} className="hover:underline">
                        {j.job_number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={j.status} />
                    </TableCell>
                    <TableCell>{formatDate(j.job_start_date)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <EditVanDialog
        van={editVan}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["customer", customerId] })}
      />
    </div>
  )
}
