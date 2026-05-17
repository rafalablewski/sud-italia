"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, MapPin, Truck } from "lucide-react";
import type { TruckEvent, TruckEventStatus, TruckRoute } from "@/data/types";
import { getActiveLocations } from "@/data/locations";
import { useAdminLocation } from "../v2/LocationContext";
import {
  Chip,
  ChipStrip,
  MobilePage,
  PageHeader,
  PullToRefresh,
  SegmentControl,
  Section,
} from "../v2/mobile";

const FALLBACK_LOC = getActiveLocations()[0]?.slug ?? "krakow";

const STATUS_TONE: Record<TruckEventStatus, "info" | "success" | "neutral" | "danger" | "brand"> = {
  scheduled: "info",
  live: "brand",
  done: "success",
  cancelled: "danger",
};

type Tab = "events" | "routes";

/** Mobile truck ops — events list + route reference. */
export function MobileTruck() {
  const { location: globalLoc } = useAdminLocation();
  const [pageLoc, setPageLoc] = useState<string>(globalLoc || FALLBACK_LOC);
  const [tab, setTab] = useState<Tab>("events");
  const [routes, setRoutes] = useState<TruckRoute[]>([]);
  const [events, setEvents] = useState<TruckEvent[]>([]);

  useEffect(() => {
    if (globalLoc) setPageLoc(globalLoc);
  }, [globalLoc]);

  const refresh = async () => {
    const [r, e] = await Promise.all([
      fetch(`/api/admin/truck-routes?location=${pageLoc}`).then((res) => (res.ok ? res.json() : [])),
      fetch(`/api/admin/truck-events?location=${pageLoc}`).then((res) => (res.ok ? res.json() : [])),
    ]);
    setRoutes(Array.isArray(r) ? r : []);
    setEvents(Array.isArray(e) ? e : []);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageLoc]);

  const upcomingEvents = useMemo(
    () =>
      [...events]
        .sort((a, b) => a.date.localeCompare(b.date))
        .filter((e) => e.status === "scheduled" || e.status === "live"),
    [events],
  );
  const pastEvents = useMemo(
    () =>
      [...events]
        .filter((e) => e.status === "done" || e.status === "cancelled")
        .sort((a, b) => b.date.localeCompare(a.date)),
    [events],
  );

  return (
    <PullToRefresh onRefresh={refresh}>
      <MobilePage
        toolbar={
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SegmentControl<Tab>
              value={tab}
              onChange={setTab}
              options={[
                { value: "events", label: `Events (${events.length})` },
                { value: "routes", label: `Routes (${routes.length})` },
              ]}
              ariaLabel="Truck tab"
            />
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
          </div>
        }
      >
        <PageHeader title="Truck ops" subtitle={pageLoc.toUpperCase()} />

        {tab === "events" && (
          <>
            {upcomingEvents.length > 0 && (
              <Section title="Upcoming">
                <ul role="list" className="v2-m-list">
                  {upcomingEvents.map((e) => (
                    <EventRow key={e.id} event={e} />
                  ))}
                </ul>
              </Section>
            )}

            {pastEvents.length > 0 && (
              <Section title="Past">
                <ul role="list" className="v2-m-list">
                  {pastEvents.slice(0, 20).map((e) => (
                    <EventRow key={e.id} event={e} />
                  ))}
                </ul>
              </Section>
            )}

            {events.length === 0 && (
              <div className="v2-m-empty">
                <CalendarDays className="h-6 w-6" aria-hidden />
                <div className="v2-m-empty-title">No events</div>
                <div className="v2-m-empty-desc">Schedule the next pop-up on desktop.</div>
              </div>
            )}
          </>
        )}

        {tab === "routes" && (
          <>
            {routes.length === 0 ? (
              <div className="v2-m-empty">
                <Truck className="h-6 w-6" aria-hidden />
                <div className="v2-m-empty-title">No routes</div>
              </div>
            ) : (
              <ul role="list" className="v2-m-list">
                {routes.map((r) => (
                  <li key={r.id}>
                    <div className="v2-m-list-row">
                      <span className="v2-m-list-icon v2-m-tone-info">
                        <Truck className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="v2-m-list-stack">
                        <span className="v2-m-list-title">{r.name}</span>
                        <span className="v2-m-list-sub">
                          {r.stops.length} stop{r.stops.length === 1 ? "" : "s"}
                          {r.description ? ` · ${r.description}` : ""}
                        </span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </MobilePage>
    </PullToRefresh>
  );
}

function EventRow({ event }: { event: TruckEvent }) {
  return (
    <li>
      <div className="v2-m-list-row">
        <span className={`v2-m-list-icon v2-m-tone-${STATUS_TONE[event.status]}`}>
          <MapPin className="h-4 w-4" aria-hidden />
        </span>
        <span className="v2-m-list-stack">
          <span className="v2-m-list-title">{event.name}</span>
          <span className="v2-m-list-sub tabular">
            {event.date}
            {event.expectedAttendance ? ` · ${event.expectedAttendance} expected` : ""}
            {event.actualOrders ? ` · ${event.actualOrders} orders` : ""}
          </span>
        </span>
        <span className={`v2-m-pill v2-m-pill-${STATUS_TONE[event.status]}`}>
          {event.status}
        </span>
      </div>
    </li>
  );
}
