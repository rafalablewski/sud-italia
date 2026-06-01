"use client";

import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { CoreShell } from "../core/CoreShell";
import { ServiceViewNav, type ServiceView } from "./ServiceViewNav";
import { BookView } from "./BookView";
import { FloorView } from "./FloorView";
import { SlotsView } from "./SlotsView";

/**
 * Service — the merged Floor + Slots Core surface (CoreShell / `.core-suite`).
 * One shell, three views via the topbar `.viewnav`: Book (slot + table in one
 * step), Floor (live room + twin), Slots (capacity + demand). The old
 * /admin/floor and /admin/slots redirect in with ?view=. See
 * docs/design-system/core/modules/service.md.
 */

const LOCS = getActiveLocations().map((l) => ({ key: l.slug, label: l.name }));
const FALLBACK = LOCS[0]?.key ?? "krakow";
const VIEW_LABEL: Record<ServiceView, string> = { book: "Book", floor: "Floor", slots: "Slots" };

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
function isView(v: string | null): v is ServiceView {
  return v === "book" || v === "floor" || v === "slots";
}

export function ServiceConsole() {
  const [view, setView] = useState<ServiceView>("book");
  const [loc, setLoc] = useState<string>(FALLBACK);
  const [date, setDate] = useState<string>(isoToday);

  // Seed the view from ?view= (so /admin/floor → ?view=floor lands right).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("view");
    if (isView(q)) setView(q);
  }, []);

  const selectView = (v: ServiceView) => {
    setView(v);
    const url = new URL(window.location.href);
    url.searchParams.set("view", v);
    window.history.replaceState(null, "", url.toString());
  };

  return (
    <CoreShell
      crumbs={
        <>
          Core / <b>Service</b> · {VIEW_LABEL[view]}
        </>
      }
      viewnav={<ServiceViewNav current={view} onSelect={selectView} />}
      topbarRight={
        <>
          <div className="seg">
            {LOCS.map((l) => (
              <button key={l.key} type="button" className={loc === l.key ? "on" : ""} onClick={() => setLoc(l.key)}>
                {l.label}
              </button>
            ))}
          </div>
          {view !== "floor" && (
            <label className="svc-date">
              <CalendarDays width={14} height={14} />
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          )}
        </>
      }
    >
      {view === "book" ? (
        <BookView loc={loc} date={date} />
      ) : view === "floor" ? (
        <FloorView loc={loc} />
      ) : (
        <SlotsView loc={loc} date={date} />
      )}
    </CoreShell>
  );
}
