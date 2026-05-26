"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { useQueryClient } from "@tanstack/react-query"

import {
  CustomerCombobox,
  type SelectedCustomer,
} from "@/components/jobs/customer-combobox"
import { VanCombobox, type SelectedVan } from "@/components/jobs/van-combobox"
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
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createJob } from "@/lib/actions/jobs"
import { BILLING_TYPES, JOB_TYPES, PRIORITIES } from "@/lib/job-display"
import { useBays, useTechnicians } from "@/lib/queries"
import { nextWorkingDay, toDateString } from "@/lib/work-days"

const NONE = "none"

const schema = z.object({
  customerId: z.string().min(1, "Select or create a customer"),
  vanId: z.string().min(1, "Select or add a van"),
  billingType: z.enum(["Private", "Insurance", "Warranty", "Dealer"]),
  insuranceClaimNumber: z.string().optional(),
  warrantyReference: z.string().optional(),
  priority: z.enum(["Low", "Normal", "High", "Urgent"]),
  description: z.string().optional(),
  jobType: z.enum(["Servicing", "Repairs", "Upgrades & Installation", "Other"]),
  quotedHours: z.coerce.number().min(0.5, "Minimum 0.5 hours"),
  assignedTechId: z.string(),
  bayId: z.string(),
  bookingDate: z.date(),
  jobStartDate: z.date(),
  customerPromisedDate: z.date().optional(),
})

type FormValues = z.input<typeof schema>

export function NewJobDialog({ locationId }: { locationId: string }) {
  const [open, setOpen] = React.useState(false)
  const router = useRouter()
  const queryClient = useQueryClient()
  const [customerSel, setCustomerSel] = React.useState<SelectedCustomer | null>(null)
  const [vanSel, setVanSel] = React.useState<SelectedVan | null>(null)

  const { data: techs = [] } = useTechnicians(locationId, true)
  const { data: bays = [] } = useBays(locationId)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerId: "",
      vanId: "",
      billingType: "Private",
      insuranceClaimNumber: "",
      warrantyReference: "",
      priority: "Normal",
      description: "",
      jobType: "Servicing",
      quotedHours: 4,
      assignedTechId: NONE,
      bayId: NONE,
      bookingDate: new Date(),
      jobStartDate: nextWorkingDay(),
      customerPromisedDate: undefined,
    },
  })

  const billingType = useWatch({ control: form.control, name: "billingType" })

  function reset() {
    form.reset()
    setCustomerSel(null)
    setVanSel(null)
  }

  async function onSubmit(values: FormValues) {
    const res = await createJob({
      locationId,
      customerId: values.customerId,
      vanId: values.vanId,
      billingType: values.billingType,
      priority: values.priority,
      jobType: values.jobType,
      description: values.description,
      quotedHours: Number(values.quotedHours),
      assignedTechId: values.assignedTechId === NONE ? null : values.assignedTechId,
      bayId: values.bayId === NONE ? null : values.bayId,
      bookingDate: toDateString(values.bookingDate as Date),
      jobStartDate: toDateString(values.jobStartDate as Date),
      customerPromisedDate: values.customerPromisedDate
        ? toDateString(values.customerPromisedDate as Date)
        : null,
      insuranceClaimNumber: values.insuranceClaimNumber,
      warrantyReference: values.warrantyReference,
    })
    if ("error" in res) {
      toast.error("Could not create job", { description: res.error })
      return
    }
    toast.success("Job created")
    queryClient.invalidateQueries({ queryKey: ["jobs"] })
    setOpen(false)
    reset()
    router.push(`/jobs/${res.id}`)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> New Job
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New job</DialogTitle>
          <DialogDescription>
            Create a job for the current location. A job number is generated
            automatically.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* Customer */}
            <FormField
              control={form.control}
              name="customerId"
              render={() => (
                <FormItem>
                  <FormLabel>Customer</FormLabel>
                  <CustomerCombobox
                    value={customerSel}
                    onSelect={(c) => {
                      setCustomerSel(c)
                      form.setValue("customerId", c.id, { shouldValidate: true })
                      setVanSel(null)
                      form.setValue("vanId", "")
                    }}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Van */}
            <FormField
              control={form.control}
              name="vanId"
              render={() => (
                <FormItem>
                  <FormLabel>Van</FormLabel>
                  <VanCombobox
                    customerId={customerSel?.id ?? null}
                    value={vanSel}
                    onSelect={(v) => {
                      setVanSel(v)
                      form.setValue("vanId", v.id, { shouldValidate: true })
                    }}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Billing type */}
            <FormField
              control={form.control}
              name="billingType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Billing type</FormLabel>
                  <FormControl>
                    <RadioGroup
                      className="flex flex-wrap gap-4"
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      {BILLING_TYPES.map((bt) => (
                        <label
                          key={bt}
                          className="flex items-center gap-2 text-sm"
                        >
                          <RadioGroupItem value={bt} />
                          {bt}
                        </label>
                      ))}
                    </RadioGroup>
                  </FormControl>
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
              {/* Priority */}
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

              {/* Job type */}
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

            {/* Description */}
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
              {/* Booking date */}
              <FormField
                control={form.control}
                name="bookingDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Booking date</FormLabel>
                    <DatePicker
                      value={field.value as Date}
                      onChange={(d) => field.onChange(d)}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Job start date */}
              <FormField
                control={form.control}
                name="jobStartDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Job start date</FormLabel>
                    <DatePicker
                      value={field.value as Date}
                      onChange={(d) => field.onChange(d)}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Quoted hours */}
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

              {/* Customer promised pickup date */}
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
              {/* Technician */}
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

              {/* Bay (low priority, kept at the end) */}
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

            <DialogFooter>
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                Create job
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
