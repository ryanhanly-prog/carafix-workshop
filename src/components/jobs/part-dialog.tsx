"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { parseISO } from "date-fns"
import { Loader2, Pencil, Plus } from "lucide-react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { useQueryClient } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
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
import { Switch } from "@/components/ui/switch"
import { createPart, updatePart } from "@/lib/actions/parts"
import { PART_STATUSES } from "@/lib/job-display"
import { toDateString } from "@/lib/work-days"
import type { Part } from "@/lib/types"

const schema = z.object({
  description: z.string().min(1, "Description is required"),
  supplier: z.string().optional(),
  quantity: z.coerce.number().min(1, "At least 1"),
  is_critical: z.boolean(),
  status: z.enum(["Needed", "Ordered", "Received", "Fitted", "Cancelled"]),
  ordered_date: z.date().optional(),
  eta_date: z.date().optional(),
})

type FormValues = z.input<typeof schema>

export function PartDialog({ jobId, part }: { jobId: string; part?: Part }) {
  const [open, setOpen] = React.useState(false)
  const queryClient = useQueryClient()
  const editing = !!part

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      description: part?.description ?? "",
      supplier: part?.supplier ?? "",
      quantity: part?.quantity ?? 1,
      is_critical: part?.is_critical ?? true,
      status: part?.status ?? "Needed",
      ordered_date: part?.ordered_date ? parseISO(part.ordered_date) : undefined,
      eta_date: part?.eta_date ? parseISO(part.eta_date) : undefined,
    },
  })

  async function onSubmit(values: FormValues) {
    const payload = {
      description: values.description,
      supplier: values.supplier,
      quantity: Number(values.quantity),
      is_critical: values.is_critical,
      status: values.status,
      ordered_date: values.ordered_date ? toDateString(values.ordered_date) : null,
      eta_date: values.eta_date ? toDateString(values.eta_date) : null,
    }
    const res = editing
      ? await updatePart(part!.id, payload)
      : await createPart(jobId, payload)
    if (res.error) {
      toast.error("Could not save part", { description: res.error })
      return
    }
    toast.success(editing ? "Part updated" : "Part added")
    queryClient.invalidateQueries({ queryKey: ["job-parts", jobId] })
    queryClient.invalidateQueries({ queryKey: ["parts"] })
    setOpen(false)
    if (!editing) form.reset()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {editing ? (
          <Button variant="ghost" size="icon-sm" aria-label="Edit part">
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="size-4" /> Add part
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit part" : "Add part"}</DialogTitle>
          <DialogDescription>
            Parts are linked to this job. Critical parts block the job from
            progressing.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="supplier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        step={1}
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
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PART_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="ordered_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Ordered date</FormLabel>
                    <DatePicker value={field.value} onChange={field.onChange} />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="eta_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>ETA date</FormLabel>
                    <DatePicker value={field.value} onChange={field.onChange} />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="is_critical"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border p-3">
                  <FormLabel className="m-0">Critical (blocks job start)</FormLabel>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                {editing ? "Save" : "Add part"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
