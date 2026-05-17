"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import { getActiveLocations } from "@/data/locations";
import { useAdminLocation } from "../v2/LocationContext";
import {
  Chip,
  ChipStrip,
  MobilePage,
  PageHeader,
  PullToRefresh,
} from "../v2/mobile";

interface SlotData {
  id: string;
  locationSlug: string;
  date: string;
  time: string;
  maxOrders: number;
  currentOrders: number;
  fulfillmentTypes: string[];
  status: "draft" | "active";
}

const FALLBACK_LOC = getActiveLocations()[0]?.slug ?? "krakow";

function isoDate(d: Date) { return d.toISOString().split("T")[0]; }
function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}
function humanDay(iso: string): string {
  const today = isoDate(new Date());
  if (iso === today) return "Today";
  if (iso === addDays(today, 1)) return "Tomorrow";
  return new Date(`${iso}T00:00:00`).toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

/**
 * Mobile slots — day view, slot cards with capacity bar. Editing is
 * desktop-only per the audit; mobile gets browse + capacity-at-a-glance.
 */
export function MobileSlots() {
  const { location: globalLoc } = useAdminLocation();
  const [pageLoc, setPageLoc] = useState<string>(globalLoc || FALLBACK_LOC);
  const [day, setDay] = useState<string>(() => isoDate(new Date()));
  const [slots, setSlots] = useState<SlotData[]>([]);

  useEffect(() => {
    if (globalLoc) setPageLoc(globalLoc);
  }, [globalLoc]);

  const refresh = async () => {
    const r = await fetch(`/api/admin/slots?location=${pageLoc}&date=${day}`);
    if (!r.ok) return;
    const data = await r.json();
    setSlots(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageLoc, day]);

  const sorted = useMemo(
    () => [...slots].sort((a, b) => a.time.localeCompare(b.time)),
    [slots],
  );

  const totalCapacity = sorted.reduce((a, s) => a + s.maxOrders, 0);
  const totalBooked = sorted.reduce((a, s) => a + s.currentOrders, 0);

  return (
    <PullToRefresh onRefresh={refresh}>
      <MobilePage
        toolbar={
          <ChipStrip ariaLabel="Location">
            {getActiveLocations().map((l) => (
              <Chip
                key={l.slug}
                label={l.city}
                active={pageLoc === l.slug}
                onClick={() => setPageLoc(l.slug)}
              />
            ))}
          </ChipStrip>
        }
      >
        <PageHeader
          title={humanDay(day)}
          subtitle={
            sorted.length === 0
              ? "No slots"
              : `${totalBooked} of ${totalCapacity} booked · ${sorted.length} slots`
          }
          actions={
            <div style={{ display: "inline-flex", gap: 4 }}>
              <button
                type="button"
                className="v2-m-icon-btn"
                aria-label="Previous"
                onClick={() => setDay((d) => addDays(d, -1))}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                className="v2-m-icon-btn"
                aria-label="Next"
                onClick={() => setDay((d) => addDays(d, 1))}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          }
        />

        {sorted.length === 0 ? (
          <div className="v2-m-empty">
            <CalendarClock className="h-6 w-6" aria-hidden />
            <div className="v2-m-empty-title">No slots configured</div>
            <div className="v2-m-empty-desc">Add them on desktop.</div>
          </div>
        ) : (
          <ul role="list" className="v2-m-list">
            {sorted.map((s) => {
              const pct = s.maxOrders ? (s.currentOrders / s.maxOrders) * 100 : 0;
              const tone: "success" | "warning" | "danger" =
                pct >= 100 ? "danger" : pct >= 75 ? "warning" : "success";
              return (
                <li key={s.id}>
                  <div className="v2-m-list-row">
                    <span className={`v2-m-list-icon v2-m-tone-${tone}`}>
                      <CalendarClock className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="v2-m-list-stack">
                      <span className="v2-m-list-title tabular">{s.time}</span>
                      <span className="v2-m-list-sub">
                        {s.currentOrders} of {s.maxOrders} · {s.fulfillmentTypes.join(", ")}
                      </span>
                      <span
                        aria-hidden
                        style={{
                          display: "block",
                          height: 3,
                          background: "var(--surface-3)",
                          borderRadius: 2,
                          marginTop: 6,
                          overflow: "hidden",
                        }}
                      >
                        <span
                          style={{
                            display: "block",
                            width: `${Math.min(100, pct)}%`,
                            height: "100%",
                            background: `var(--${tone})`,
                          }}
                        />
                      </span>
                    </span>
                    <span className={`v2-m-pill v2-m-pill-${tone}`}>
                      {Math.round(pct)}%
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </MobilePage>
    </PullToRefresh>
  );
}
