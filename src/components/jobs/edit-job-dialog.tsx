"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { parseISO } from "date-fns"
import { Loader2, Pencil } from "lucide-react"
import { useForm, useWatch } from "react-hook-form"
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
import { Textarea } from "@/components/ui/textarea"
import { updateJob } from "@/lib/actions/jobs"
import { BILLING_TYPES, JOB_TYPES, PRIORITIES } from "@/lib/job-display"
import { useBays, useTechnicians } from "@/lib/queries"
import type { JobDetail } from "@/lib/types"
import { toDateString } from "@/lib/work-days"

const NONE = "none"

const schema = z.object({
  billingType: z.enum(["Private", "Insurance", "Warranty", "Dealer"]),
  insuranceClaimNumber: z.string().optional(),
  warrantyReference: z.string().optional(),
  priority: z.enum(["Low", "Normal", "High", "Urgent"]),
  jobType: z.enum(["Servicing", "Repairs", "Upgrades & Installation", "Other"]),
  description: z.string().optional(),
  quotedHours: z.coerce.number().min(0.5, "Minimum 0.5 hours"),
  assignedTechId: z.string(),
  bayId: z.string(),
  customerPromisedDate: z.date().optional(),
  internalNotes: z.string().optional(),
})

type FormValues = z.input<typeof schema>

export function EditJobDialog({ job }: { job: JobDetail }) {
  const [open, setOpen] = React.useState(false)
  const queryClient = useQueryClient()
  const { data: techs = [] } = useTechnicians(job.location_id, true)
  const { data: bays = [] } = useBays(job.location_id)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      billingType: job.billing_type,
      insuranceClaimNumber: job.insurance_claim_number ?? "",
      warrantyReference: job.warranty_reference ?? "",
      priority: job.priority,
      jobType: job.job_type ?? "Servicing",
      description: job.description ?? "",
      quotedHours: job.quoted_hours ?? 0.5,
      assignedTechId: job.assigned_tech_id ?? NONE,
      bayId: job.bay_id ?? NONE,
      customerPromisedDate: job.customer_promised_date
        ? parseISO(job.customer_promised_date)
        : undefined,
      internalNotes: job.internal_notes ?? "",
    },
  })

  const billingType = useWatch({ control: form.control, name: "billingType" })

  async function onSubmit(values: FormValues) {
    const res = await updateJob(job.id, {
      billing_type: values.billingType,
      priority: values.priority,
      job_type: values.jobType,
      description: values.description?.trim() || null,
      quoted_hours: Number(values.quotedHours),
      assigned_tech_id: values.assignedTechId === NONE ? null : values.assignedTechId,
      bay_id: values.bayId === NONE ? null : values.bayId,
      customer_promised_date: values.customerPromisedDate
        ? toDateString(values.customerPromisedDate as Date)
        : null,
      internal_notes: values.internalNotes?.trim() || null,
      insurance_claim_number:
        values.billingType === "Insurance"
          ? values.insuranceClaimNumber?.trim() || null
          : null,
      warranty_reference:
        values.billingType === "Warranty"
          ? values.warrantyReference?.trim() || null
          : null,
    })
    if (res.error) {
      toast.error("Could not save changes", { description: res.error })
      return
    }
    toast.success("Job updated")
    queryClient.invalidateQueries({ queryKey: ["job", job.id] })
    queryClient.invalidateQueries({ queryKey: ["jobs"] })
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="size-4" /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit job {job.job_number}</DialogTitle>
          <DialogDescription>
            Update job details. Expected-finish date and status are changed
            separately.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="billingType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Billing type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {BILLING_TYPES.map((bt) => (
                        <SelectItem key={bt} value={bt}>
                          {bt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {billingType === "Insurance" ? (
              <FormField
                control={form.control}
                name="insuranceClaimNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Insurance claim number</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            {billingType === "Warranty" ? (
              <FormField
                control={form.control}
                name="warrantyReference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Chassis number or rego</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PRIORITIES.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
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
                name="jobType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Job type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {JOB_TYPES.map((jt) => (
                          <SelectItem key={jt} value={jt}>
                            {jt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="quotedHours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quoted hours</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0.5}
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
                name="customerPromisedDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Customer promised pickup date</FormLabel>
                    <DatePicker
                      value={field.value as Date | undefined}
                      onChange={(d) => field.onChange(d)}
                      placeholder="Optional"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="assignedTechId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Technician</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Unassigned</SelectItem>
                        {techs.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
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
                name="bayId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bay</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="No bay" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>No bay</SelectItem>
                        {bays.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="internalNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Internal notes</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
