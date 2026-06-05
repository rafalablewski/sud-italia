"use client";

import Link from "next/link";
import { CalendarDays, Armchair } from "lucide-react";

/**
 * The views of the Service surface, rendered into the CoreShell topbar
 * `.viewnav` slot (same pattern as the Guest hub's GuestViewNav). Each is its
 * own nested route under `/core/service/*`: Floor (live room + twin), Slots
 * (capacity + demand). Booking moved into the Guest hub (`/core/guest/book`);
 * the bare `/core/service` redirects to Floor.
 */
export type ServiceView = "floor" | "slots";

const VIEWS: { id: ServiceView; label: string; icon: typeof Armchair }[] = [
  { id: "floor", label: "Floor", icon: Armchair },
  { id: "slots", label: "Slots", icon: CalendarDays },
];

export function ServiceViewNav({ current }: { current: ServiceView }) {
  return (
    <>
      {VIEWS.map((v) => {
        const Icon = v.icon;
        return (
          <Link
            key={v.id}
            href={`/core/service/${v.id}`}
            className={v.id === current ? "on" : undefined}
            aria-current={v.id === current ? "page" : undefined}
          >
            <Icon width={14} height={14} />
            {v.label}
          </Link>
        );
      })}
    </>
  );
}
