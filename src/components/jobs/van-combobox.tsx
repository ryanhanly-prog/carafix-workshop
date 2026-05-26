"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react"
import { toast } from "sonner"

import { createVan } from "@/lib/actions/vans"
import { useVansByCustomer } from "@/lib/queries"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export type SelectedVan = { id: string; label: string }

function vanLabel(v: {
  make: string | null
  model: string | null
  rego: string | null
}) {
  const base = [v.make, v.model].filter(Boolean).join(" ") || "Van"
  return v.rego ? `${base} · ${v.rego}` : base
}

export function VanCombobox({
  customerId,
  value,
  onSelect,
}: {
  customerId: string | null
  value: SelectedVan | null
  onSelect: (van: SelectedVan) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const { data: vans = [], isLoading } = useVansByCustomer(customerId)

  const [make, setMake] = React.useState("")
  const [model, setModel] = React.useState("")
  const [year, setYear] = React.useState("")
  const [rego, setRego] = React.useState("")
  const [pending, startTransition] = React.useTransition()

  function handleCreate() {
    if (!customerId) return
    if (!make.trim() && !model.trim() && !rego.trim()) {
      toast.error("Enter at least a make, model or rego")
      return
    }
    startTransition(async () => {
      const res = await createVan({
        customerId,
        make,
        model,
        year: year ? Number(year) : null,
        rego,
      })
      if ("error" in res) {
        toast.error("Could not add van", { description: res.error })
        return
      }
      onSelect({ id: res.id, label: vanLabel({ make, model, rego }) })
      setCreating(false)
      setMake("")
      setModel("")
      setYear("")
      setRego("")
      setOpen(false)
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={!customerId}
          className="w-full justify-between font-normal"
        >
          {value ? value.label : "Select van…"}
          <ChevronsUpDown className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        {creating ? (
          <div className="space-y-3 p-3">
            <p className="text-sm font-medium">New van</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="nv-make">Make</Label>
                <Input id="nv-make" value={make} onChange={(e) => setMake(e.target.value)} autoFocus />
              </div>
              <div className="space-y-1">
                <Label htmlFor="nv-model">Model</Label>
                <Input id="nv-model" value={model} onChange={(e) => setModel(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="nv-year">Year</Label>
                <Input id="nv-year" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="nv-rego">Rego</Label>
                <Input id="nv-rego" value={rego} onChange={(e) => setRego(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={handleCreate} disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                Add van
              </Button>
            </div>
          </div>
        ) : (
          <Command>
            <CommandList>
              {isLoading ? (
                <div className="p-3 text-sm text-muted-foreground">Loading…</div>
              ) : (
                <CommandEmpty>No vans for this customer yet.</CommandEmpty>
              )}
              <CommandGroup>
                {vans.map((v) => (
                  <CommandItem
                    key={v.id}
                    value={v.id}
                    onSelect={() => {
                      onSelect({ id: v.id, label: vanLabel(v) })
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        "size-4",
                        value?.id === v.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {vanLabel(v)}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            <div className="border-t p-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => setCreating(true)}
              >
                <Plus className="size-4" /> Add new van
              </Button>
            </div>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  )
}
