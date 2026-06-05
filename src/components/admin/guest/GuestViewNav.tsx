"use client";

import Link from "next/link";
import { CalendarCheck2, Heart, Inbox, Sparkles, UsersRound } from "lucide-react";

/**
 * The views of the unified Guest Engagement hub, rendered into the CoreShell
 * topbar's `.viewnav` slot. CRM, Concierge, WhatsApp, Loyalty and Booking each
 * have their own nested route under `/core/guest/*` (Inbox → whatsapp, Guests →
 * crm, Loyalty, Concierge, Book). The bare `/core/guest` redirects to the Inbox.
 */
export type GuestView = "inbox" | "guests" | "loyalty" | "concierge" | "book";

const VIEWS: { id: GuestView; path: string; label: string; icon: typeof Inbox }[] = [
  { id: "inbox", path: "whatsapp", label: "Inbox", icon: Inbox },
  { id: "guests", path: "crm", label: "Guests", icon: UsersRound },
  { id: "loyalty", path: "loyalty", label: "Loyalty", icon: Heart },
  { id: "concierge", path: "concierge", label: "Concierge", icon: Sparkles },
  { id: "book", path: "book", label: "Book", icon: CalendarCheck2 },
];

export function GuestViewNav({
  current,
  counts,
}: {
  current: GuestView;
  counts?: Partial<Record<GuestView, number>>;
}) {
  return (
    <>
      {VIEWS.map((v) => {
        const Icon = v.icon;
        const count = counts?.[v.id];
        return (
          <Link
            key={v.id}
            href={`/core/guest/${v.path}`}
            className={v.id === current ? "on" : undefined}
            aria-current={v.id === current ? "page" : undefined}
          >
            <Icon width={14} height={14} />
            {v.label}
            {typeof count === "number" && <span className="n">{count}</span>}
          </Link>
        );
      })}
    </>
  );
}
