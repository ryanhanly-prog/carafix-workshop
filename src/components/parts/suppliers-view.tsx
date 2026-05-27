"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2, Pencil, Plus } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { createSupplier, updateSupplier, type SupplierInput } from "@/lib/actions/suppliers"
import { formatDate } from "@/lib/format"

export type SupplierRow = {
  id: string
  name: string
  primary_contact_name: string | null
  phone: string | null
  email: string | null
  website: string | null
  address: string | null
  account_number: string | null
  payment_terms: string | null
  notes: string | null
  item_count: number
  last_order_date: string | null
}

type DrawerState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; supplier: SupplierRow }

const EMPTY: SupplierInput = {
  name: "",
  primary_contact_name: "",
  phone: "",
  email: "",
  website: "",
  address: "",
  account_number: "",
  payment_terms: "",
  notes: "",
}

function SupplierDrawer({
  state,
  onClose,
  onSaved,
}: {
  state: DrawerState
  onClose: () => void
  onSaved: () => void
}) {
  const open = state.mode !== "closed"
  const editing = state.mode === "edit" ? state.supplier : null
  // An imported supplier (matched by name on re-import) keeps a locked name so a
  // rename can't cause a duplicate on the next import.
  const imported = !!editing && editing.item_count > 0
  const [form, setForm] = React.useState<SupplierInput>(EMPTY)
  const [pending, startTransition] = React.useTransition()

  React.useEffect(() => {
    if (state.mode === "edit") {
      const s = state.supplier
      setForm({
        name: s.name,
        primary_contact_name: s.primary_contact_name ?? "",
        phone: s.phone ?? "",
        email: s.email ?? "",
        website: s.website ?? "",
        address: s.address ?? "",
        account_number: s.account_number ?? "",
        payment_terms: s.payment_terms ?? "",
        notes: s.notes ?? "",
      })
    } else if (state.mode === "create") {
      setForm(EMPTY)
    }
  }, [state])

  function set<K extends keyof SupplierInput>(key: K, value: SupplierInput[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function save() {
    if (!form.name.trim()) {
      toast.error("Name is required.")
      return
    }
    startTransition(async () => {
      const res = editing
        ? await updateSupplier(editing.id, form)
        : await createSupplier(form)
      if (res.error) {
        toast.error("Could not save supplier", { description: res.error })
        return
      }
      toast.success(editing ? "Supplier updated" : "Supplier added")
      onSaved()
      onClose()
    })
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{editing ? editing.name : "New supplier"}</SheetTitle>
          <SheetDescription>
            {editing
              ? "Edit contact details so parts can be ordered from here."
              : "Add a supplier you order from."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-4">
          <Field label="Name" required>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              disabled={imported}
            />
            {imported && (
              <p className="mt-1 text-xs text-muted-foreground">
                Imported from Mechanic Desk — name is locked to keep imports matching.
              </p>
            )}
          </Field>
          <Field label="Primary contact">
            <Input
              value={form.primary_contact_name ?? ""}
              onChange={(e) => set("primary_contact_name", e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <Input
                value={form.phone ?? ""}
                onChange={(e) => set("phone", e.target.value)}
                inputMode="tel"
              />
              {form.phone?.trim() ? (
                <a href={`tel:${form.phone.trim()}`} className="mt-1 block text-xs text-primary hover:underline">
                  Call {form.phone.trim()}
                </a>
              ) : null}
            </Field>
            <Field label="Email">
              <Input
                value={form.email ?? ""}
                onChange={(e) => set("email", e.target.value)}
                inputMode="email"
              />
              {form.email?.trim() ? (
                <a href={`mailto:${form.email.trim()}`} className="mt-1 block text-xs text-primary hover:underline">
                  Email
                </a>
              ) : null}
            </Field>
          </div>
          <Field label="Website">
            <Input
              value={form.website ?? ""}
              onChange={(e) => set("website", e.target.value)}
              placeholder="https://…"
            />
            {form.website?.trim() ? (
              <a
                href={form.website.trim().startsWith("http") ? form.website.trim() : `https://${form.website.trim()}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block text-xs text-primary hover:underline"
              >
                Open site
              </a>
            ) : null}
          </Field>
          <Field label="Address">
            <Textarea
              rows={2}
              value={form.address ?? ""}
              onChange={(e) => set("address", e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Account number">
              <Input
                value={form.account_number ?? ""}
                onChange={(e) => set("account_number", e.target.value)}
              />
            </Field>
            <Field label="Payment terms">
              <Input
                value={form.payment_terms ?? ""}
                onChange={(e) => set("payment_terms", e.target.value)}
                placeholder="Net 30, COD…"
              />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea
              rows={3}
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>

          {editing && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p>
                Supplies{" "}
                <Link
                  href={`/parts/catalogue?supplier=${editing.id}`}
                  className="text-primary hover:underline"
                >
                  {editing.item_count} stock item{editing.item_count === 1 ? "" : "s"}
                </Link>
              </p>
              <p className="text-muted-foreground">
                Last purchase: {formatDate(editing.last_order_date)}
              </p>
            </div>
          )}
        </div>

        <SheetFooter>
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {editing ? "Save changes" : "Add supplier"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <Label className="mb-1 block text-xs">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </Label>
      {children}
    </div>
  )
}

export function SuppliersView({ suppliers }: { suppliers: SupplierRow[] }) {
  const router = useRouter()
  const [drawer, setDrawer] = React.useState<DrawerState>({ mode: "closed" })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Suppliers derived from imported stock. Add contact details to order parts
          straight from here.
        </p>
        <Button size="sm" onClick={() => setDrawer({ mode: "create" })}>
          <Plus className="size-4" />
          New supplier
        </Button>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right"># Items</TableHead>
                <TableHead>Last Order</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    No suppliers yet. Import from Mechanic Desk in Settings → Imports, or
                    add one above.
                  </TableCell>
                </TableRow>
              ) : (
                suppliers.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/parts/catalogue?supplier=${s.id}`}
                        className="hover:underline"
                      >
                        {s.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {s.phone ? (
                        <a href={`tel:${s.phone}`} className="text-primary hover:underline">
                          {s.phone}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate">
                      {s.email ? (
                        <a href={`mailto:${s.email}`} className="text-primary hover:underline">
                          {s.email}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{s.item_count}</TableCell>
                    <TableCell>{formatDate(s.last_order_date)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${s.name}`}
                        onClick={() => setDrawer({ mode: "edit", supplier: s })}
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

      <SupplierDrawer
        state={drawer}
        onClose={() => setDrawer({ mode: "closed" })}
        onSaved={() => router.refresh()}
      />
    </div>
  )
}
