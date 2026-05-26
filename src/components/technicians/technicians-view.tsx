"use client"

import * as React from "react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"

import { TechnicianDialog } from "@/components/technicians/technician-dialog"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { setTechnicianActive } from "@/lib/actions/technicians"
import { useLocation } from "@/lib/location-context"
import { useTechnicians } from "@/lib/queries"
import type { Technician } from "@/lib/types"

function TechRow({
  tech,
  locationName,
}: {
  tech: Technician
  locationName: string
}) {
  const queryClient = useQueryClient()
  const [pending, startTransition] = React.useTransition()

  function toggle(active: boolean) {
    startTransition(async () => {
      const res = await setTechnicianActive(tech.id, active)
      if (res.error) {
        toast.error("Could not update technician", { description: res.error })
        return
      }
      queryClient.invalidateQueries({ queryKey: ["technicians"] })
    })
  }

  return (
    <TableRow>
      <TableCell className="font-medium">
        <span className="flex items-center gap-2">
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: tech.colour ?? "#94a3b8" }}
          />
          {tech.name}
        </span>
      </TableCell>
      <TableCell>{tech.role ?? "—"}</TableCell>
      <TableCell>{locationName}</TableCell>
      <TableCell className="text-muted-foreground">{tech.email ?? "—"}</TableCell>
      <TableCell>
        <Switch
          checked={tech.active ?? false}
          onCheckedChange={toggle}
          disabled={pending}
          aria-label="Active"
        />
      </TableCell>
      <TableCell className="text-right">
        <TechnicianDialog technician={tech} defaultLocationId={tech.location_id} />
      </TableCell>
    </TableRow>
  )
}

export function TechniciansView() {
  const { currentLocationId, locations } = useLocation()
  const { data: techs, isLoading } = useTechnicians(currentLocationId)

  const locationName = React.useMemo(() => {
    const map = new Map(locations.map((l) => [l.id, l.name]))
    return (id: string | null) => (id ? map.get(id) ?? "—" : "—")
  }, [locations])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Technicians</h1>
        <TechnicianDialog defaultLocationId={currentLocationId} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Edit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ) : !techs || techs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-muted-foreground"
                  >
                    No technicians at this location yet.
                  </TableCell>
                </TableRow>
              ) : (
                techs.map((t) => (
                  <TechRow
                    key={t.id}
                    tech={t}
                    locationName={locationName(t.location_id)}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
