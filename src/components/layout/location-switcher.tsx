"use client"

import { MapPin } from "lucide-react"

import { useLocation } from "@/lib/location-context"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function LocationSwitcher() {
  const { locations, currentLocationId, setCurrentLocationId } = useLocation()

  if (locations.length === 0) {
    return null
  }

  return (
    <Select
      value={currentLocationId ?? undefined}
      onValueChange={setCurrentLocationId}
    >
      <SelectTrigger className="w-[150px]">
        <MapPin className="size-4 text-muted-foreground" />
        <SelectValue placeholder="Location" />
      </SelectTrigger>
      <SelectContent>
        {locations.map((location) => (
          <SelectItem key={location.id} value={location.id}>
            {location.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
