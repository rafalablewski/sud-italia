"use client";

import Link from "next/link";
import { Inbox, Sparkles, UsersRound } from "lucide-react";

/**
 * The three views of the unified Guest Engagement hub, rendered into the
 * CoreShell topbar's `.viewnav` slot. CRM, Concierge and WhatsApp used to be
 * three separate sidebar entries; they now read as Inbox / Guests / Concierge
 * under one surface (`/admin/guest`), and the old routes redirect here.
 */
export type GuestView = "inbox" | "guests" | "concierge";

const VIEWS: { id: GuestView; label: string; icon: typeof Inbox }[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "guests", label: "Guests", icon: UsersRound },
  { id: "concierge", label: "Concierge", icon: Sparkles },
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
            href={`/admin/guest?view=${v.id}`}
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
