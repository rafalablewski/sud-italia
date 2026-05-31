"use client";

import Link from "next/link";
import { Inbox, Users, Sparkles } from "lucide-react";

/**
 * The three views of the unified Guest Engagement hub. CRM, Concierge and
 * WhatsApp used to be three separate sidebar entries; they now render as
 * Inbox / Guests / Concierge under one surface (`/admin/guest`). Each module
 * component drops this switcher into its `cmd-head` so the cross-view nav is
 * identical everywhere and old routes redirect into the matching view.
 */
export type GuestView = "inbox" | "guests" | "concierge";

const VIEWS: { id: GuestView; label: string; icon: typeof Inbox }[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "guests", label: "Guests", icon: Users },
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
    <div className="cmd-seg-group guest-viewnav" role="group" aria-label="Guest views">
      {VIEWS.map((v) => {
        const Icon = v.icon;
        const active = v.id === current;
        const count = counts?.[v.id];
        return (
          <Link
            key={v.id}
            href={`/admin/guest?view=${v.id}`}
            className="cmd-seg"
            aria-pressed={active}
            aria-current={active ? "page" : undefined}
          >
            <Icon />
            <span>{v.label}</span>
            {typeof count === "number" && (
              <span className="cmd-seg-count tnum">{count}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
