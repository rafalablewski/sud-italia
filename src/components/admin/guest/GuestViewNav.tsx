"use client";

import Link from "next/link";
import { Heart, Inbox, Sparkles, UsersRound } from "lucide-react";

/**
 * The views of the unified Guest Engagement hub, rendered into the
 * CoreShell topbar's `.viewnav` slot. CRM, Concierge, WhatsApp and Loyalty
 * used to be separate sidebar entries; they now read as Inbox / Guests /
 * Loyalty / Concierge under one surface (`/admin/guest`), and the old routes
 * (`/admin/whatsapp`, `/admin/crm`, `/admin/loyalty`, `/admin/concierge`)
 * redirect here.
 */
export type GuestView = "inbox" | "guests" | "loyalty" | "concierge";

const VIEWS: { id: GuestView; label: string; icon: typeof Inbox }[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "guests", label: "Guests", icon: UsersRound },
  { id: "loyalty", label: "Loyalty", icon: Heart },
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
