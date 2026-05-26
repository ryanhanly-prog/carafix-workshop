"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react"
import { toast } from "sonner"

import { createCustomer } from "@/lib/actions/customers"
import { useCustomerSearch } from "@/lib/queries"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
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

export type SelectedCustomer = { id: string; name: string }

export function CustomerCombobox({
  value,
  onSelect,
}: {
  value: SelectedCustomer | null
  onSelect: (customer: SelectedCustomer) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [term, setTerm] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const { data: results = [], isLoading } = useCustomerSearch(term)

  const [name, setName] = React.useState("")
  const [phone, setPhone] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [pending, startTransition] = React.useTransition()

  function handleCreate() {
    if (!name.trim()) {
      toast.error("Customer name is required")
      return
    }
    startTransition(async () => {
      const res = await createCustomer({ name, phone, email })
      if ("error" in res) {
        toast.error("Could not create customer", { description: res.error })
        return
      }
      onSelect({ id: res.id, name: name.trim() })
      setCreating(false)
      setName("")
      setPhone("")
      setEmail("")
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
          className="w-full justify-between font-normal"
        >
          {value ? value.name : "Select customer…"}
          <ChevronsUpDown className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        {creating ? (
          <div className="space-y-3 p-3">
            <p className="text-sm font-medium">New customer</p>
            <div className="space-y-1">
              <Label htmlFor="nc-name">Name</Label>
              <Input
                id="nc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nc-phone">Phone</Label>
              <Input
                id="nc-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nc-email">Email</Label>
              <Input
                id="nc-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setCreating(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleCreate}
                disabled={pending}
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                Create
              </Button>
            </div>
          </div>
        ) : (
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search customers…"
              value={term}
              onValueChange={setTerm}
            />
            <CommandList>
              {isLoading ? (
                <div className="p-3 text-sm text-muted-foreground">
                  Searching…
                </div>
              ) : (
                <CommandEmpty>No customers found.</CommandEmpty>
              )}
              <CommandGroup>
                {results.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={c.id}
                    onSelect={() => {
                      onSelect({ id: c.id, name: c.name })
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        "size-4",
                        value?.id === c.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span>{c.name}</span>
                    {c.phone ? (
                      <span className="ml-auto text-xs text-muted-foreground">
                        {c.phone}
                      </span>
                    ) : null}
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
                onClick={() => {
                  setCreating(true)
                  setName(term)
                }}
              >
                <Plus className="size-4" /> Create new customer
              </Button>
            </div>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  )
}
