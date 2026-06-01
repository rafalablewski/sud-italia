"use client";

import { CalendarCheck2, CalendarDays, Armchair } from "lucide-react";

/**
 * The views of the merged Service surface, rendered into the CoreShell topbar
 * `.viewnav` slot (same pattern as the Guest hub's GuestViewNav). Book is the
 * unified slot+table booking; Floor is the live room (tables + twin); Slots is
 * capacity + demand. The old /admin/floor and /admin/slots redirect in here.
 */
export type ServiceView = "book" | "floor" | "slots";

const VIEWS: { id: ServiceView; label: string; icon: typeof Armchair }[] = [
  { id: "book", label: "Book", icon: CalendarCheck2 },
  { id: "floor", label: "Floor", icon: Armchair },
  { id: "slots", label: "Slots", icon: CalendarDays },
];

export function ServiceViewNav({
  current,
  onSelect,
}: {
  current: ServiceView;
  onSelect: (v: ServiceView) => void;
}) {
  return (
    <>
      {VIEWS.map((v) => {
        const Icon = v.icon;
        return (
          <button
            key={v.id}
            type="button"
            className={v.id === current ? "on" : undefined}
            aria-current={v.id === current ? "page" : undefined}
            onClick={() => onSelect(v.id)}
          >
            <Icon width={14} height={14} />
            {v.label}
          </button>
        );
      })}
    </>
  );
}
