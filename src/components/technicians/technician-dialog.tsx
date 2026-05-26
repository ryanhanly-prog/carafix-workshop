"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, Pencil, Plus } from "lucide-react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { useQueryClient } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  createTechnician,
  updateTechnician,
} from "@/lib/actions/technicians"
import { TECH_ROLES } from "@/lib/job-display"
import { useLocation } from "@/lib/location-context"
import type { Technician } from "@/lib/types"

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email").or(z.literal("")),
  role: z.enum(["Service Tech", "Caravan Repairer"]),
  locationId: z.string().min(1, "Select a location"),
  productiveHours: z.coerce.number().min(0, "Must be 0 or more"),
  weeklyCapacity: z.coerce.number().min(0, "Must be 0 or more"),
})

type FormValues = z.input<typeof schema>

export function TechnicianDialog({
  technician,
  defaultLocationId,
}: {
  technician?: Technician
  defaultLocationId: string | null
}) {
  const [open, setOpen] = React.useState(false)
  const queryClient = useQueryClient()
  const { locations } = useLocation()
  const editing = !!technician

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: technician?.name ?? "",
      email: technician?.email ?? "",
      role: technician?.role ?? "Caravan Repairer",
      locationId: technician?.location_id ?? defaultLocationId ?? "",
      productiveHours: technician?.productive_hours_per_day ?? 6.5,
      weeklyCapacity: technician?.weekly_capacity_hours ?? 32.5,
    },
  })

  async function onSubmit(values: FormValues) {
    const res = editing
      ? await updateTechnician(technician!.id, {
          name: values.name.trim(),
          email: values.email.trim() || null,
          role: values.role,
          location_id: values.locationId,
          productive_hours_per_day: Number(values.productiveHours),
          weekly_capacity_hours: Number(values.weeklyCapacity),
        })
      : await createTechnician({
          name: values.name,
          email: values.email,
          role: values.role,
          locationId: values.locationId,
          productiveHoursPerDay: Number(values.productiveHours),
          weeklyCapacityHours: Number(values.weeklyCapacity),
        })
    if (res.error) {
      toast.error("Could not save technician", { description: res.error })
      return
    }
    toast.success(editing ? "Technician updated" : "Technician added")
    queryClient.invalidateQueries({ queryKey: ["technicians"] })
    setOpen(false)
    if (!editing) form.reset()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {editing ? (
          <Button variant="ghost" size="icon-sm" aria-label="Edit technician">
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="size-4" /> Add technician
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit technician" : "Add technician"}
          </DialogTitle>
          <DialogDescription>
            Role is the v1 display role. Granular skills come later.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TECH_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="locationId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Location" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {locations.map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="productiveHours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Productive hrs/day</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step={0.5}
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        value={field.value as number}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="weeklyCapacity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Weekly capacity</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step={0.5}
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        value={field.value as number}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                {editing ? "Save" : "Add technician"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
