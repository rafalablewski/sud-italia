"use client";

import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { CoreShell } from "../core/CoreShell";
import { ServiceViewNav, type ServiceView } from "./ServiceViewNav";
import { FloorView } from "./FloorView";
import { SlotsView } from "./SlotsView";

/**
 * Service surface frame (CoreShell / `.core-suite`). Each view is its own
 * nested route (`/core/service/floor`, `/core/service/slots`) and renders this
 * frame with the matching `view` — the topbar `.viewnav` Links switch routes.
 * Floor is the live room (tables + twin); Slots is capacity + demand. Booking
 * lives in the Guest hub now (`/core/guest/book`). See
 * docs/design-system/core/modules/service.md.
 */

// Label with the city (Kraków / Warszawa) to match the POS & Guest topbars.
const LOCS = getActiveLocations().map((l) => ({ key: l.slug, label: l.city }));
const FALLBACK = LOCS[0]?.key ?? "krakow";
const VIEW_LABEL: Record<ServiceView, string> = { floor: "Floor", slots: "Slots" };
// Shared so the chosen city survives Floor ↔ Slots ↔ Book navigation (each is
// its own route, so component state would otherwise reset on every switch).
const LOC_KEY = "sud-core-service-loc";

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ServiceFrame({ view }: { view: ServiceView }) {
  const [loc, setLoc] = useState<string>(FALLBACK);
  const [date, setDate] = useState<string>(isoToday);

  useEffect(() => {
    try {
      const v = localStorage.getItem(LOC_KEY);
      if (v && LOCS.some((l) => l.key === v)) setLoc(v);
    } catch {
      /* storage may be blocked */
    }
  }, []);

  const pickLoc = (key: string) => {
    setLoc(key);
    try {
      localStorage.setItem(LOC_KEY, key);
    } catch {
      /* non-fatal */
    }
  };

  return (
    <CoreShell
      crumbs={
        <>
          Core / <b>Service</b> · {VIEW_LABEL[view]}
        </>
      }
      viewnav={<ServiceViewNav current={view} />}
      topbarRight={
        <>
          <div className="seg">
            {LOCS.map((l) => (
              <button key={l.key} type="button" className={loc === l.key ? "on" : ""} onClick={() => pickLoc(l.key)}>
                {l.label}
              </button>
            ))}
          </div>
          {view === "slots" && (
            <label className="svc-date">
              <CalendarDays width={14} height={14} />
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          )}
        </>
      }
    >
      {view === "floor" ? <FloorView loc={loc} /> : <SlotsView loc={loc} date={date} />}
    </CoreShell>
  );
}
