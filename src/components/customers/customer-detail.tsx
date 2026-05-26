"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { StatusBadge } from "@/components/jobs/badges"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDate } from "@/lib/format"
import { useCustomer } from "@/lib/queries"

export function CustomerDetail({ customerId }: { customerId: string }) {
  const { data, isLoading, isError } = useCustomer(customerId)

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

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/customers">
            <ArrowLeft className="size-4" /> Customers
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {customer.name}
        </h1>
        <p className="text-muted-foreground">
          {[customer.phone, customer.email].filter(Boolean).join(" · ") || "—"}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vans</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Make</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Rego</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
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
                <TableHead>Planned start</TableHead>
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
                    <TableCell>{formatDate(j.planned_start_date)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
