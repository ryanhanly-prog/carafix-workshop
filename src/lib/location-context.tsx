"use client"

import * as React from "react"

export type LocationOption = {
  id: string
  name: string
}

type LocationContextValue = {
  locations: LocationOption[]
  currentLocationId: string | null
  currentLocation: LocationOption | null
  setCurrentLocationId: (id: string) => void
}

const LocationContext = React.createContext<LocationContextValue | null>(null)

const STORAGE_KEY = "carafix.location-id"

export function LocationProvider({
  locations,
  defaultLocationId = null,
  children,
}: {
  locations: LocationOption[]
  defaultLocationId?: string | null
  children: React.ReactNode
}) {
  const [currentLocationId, setCurrentLocationIdState] = React.useState<
    string | null
  >(defaultLocationId ?? locations[0]?.id ?? null)

  // Hydrate the persisted choice from localStorage after mount. This must run
  // post-render (not in a lazy initializer) so the server and first client
  // render agree on the default and avoid a hydration mismatch.
  React.useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored && locations.some((l) => l.id === stored)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrentLocationIdState(stored)
    }
  }, [locations])

  const setCurrentLocationId = React.useCallback((id: string) => {
    setCurrentLocationIdState(id)
    window.localStorage.setItem(STORAGE_KEY, id)
  }, [])

  const value = React.useMemo<LocationContextValue>(() => {
    const currentLocation =
      locations.find((l) => l.id === currentLocationId) ?? null
    return {
      locations,
      currentLocationId,
      currentLocation,
      setCurrentLocationId,
    }
  }, [locations, currentLocationId, setCurrentLocationId])

  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  )
}

export function useLocation() {
  const ctx = React.useContext(LocationContext)
  if (!ctx) {
    throw new Error("useLocation must be used within a LocationProvider")
  }
  return ctx
}
