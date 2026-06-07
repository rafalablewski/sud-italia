"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getActiveLocations } from "@/data/locations";

// Mirrors v2's location context but lives in the v3 tree so v2 can be deleted.
// Reads the same persisted key so the operator's scope choice survives a cutover.
const STORAGE_KEY = "sud-admin-location";

/** "" = all locations. Otherwise a location slug. */
export type AdminLocationValue = string;

interface LocationContextValue {
  location: AdminLocationValue;
  setLocation: (slug: AdminLocationValue) => void;
  /** Active locations from src/data/locations.ts (real data, not mocked). */
  activeLocations: ReturnType<typeof getActiveLocations>;
}

const LocationContext = createContext<LocationContextValue | null>(null);

export function AdminLocationProviderV3({ children }: { children: ReactNode }) {
  const activeLocations = useMemo(() => getActiveLocations(), []);
  const [location, setLocationState] = useState<AdminLocationValue>("");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === null) return;
      if (stored === "" || activeLocations.some((l) => l.slug === stored)) {
        setLocationState(stored);
      }
    } catch {
      /* storage may be blocked */
    }
  }, [activeLocations]);

  const setLocation = useCallback((slug: AdminLocationValue) => {
    setLocationState(slug);
    try {
      localStorage.setItem(STORAGE_KEY, slug);
    } catch {
      /* non-fatal */
    }
  }, []);

  const value = useMemo(
    () => ({ location, setLocation, activeLocations }),
    [location, setLocation, activeLocations],
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useAdminLocationV3(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) {
    throw new Error("useAdminLocationV3 must be used within <AdminLocationProviderV3>");
  }
  return ctx;
}
