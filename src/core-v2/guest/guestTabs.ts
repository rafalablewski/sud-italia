import type { CoreV2Tab } from "@/core-v2/shell/CoreV2Shell";

/** The Guest hub's five nested views — shared so every guest page lights the
 *  same view tab in the same place on the CoreV2Shell subbar. */
export type GuestView = "inbox" | "guests" | "loyalty" | "concierge" | "book";

const TABS: { key: GuestView; label: string; href: string }[] = [
  { key: "inbox", label: "Inbox", href: "/core-v2/guest/inbox" },
  { key: "guests", label: "Guests", href: "/core-v2/guest/guests" },
  { key: "loyalty", label: "Loyalty", href: "/core-v2/guest/loyalty" },
  { key: "concierge", label: "Concierge", href: "/core-v2/guest/concierge" },
  { key: "book", label: "Book", href: "/core-v2/guest/book" },
];

export function guestTabs(active: GuestView): CoreV2Tab[] {
  return TABS.map((t) => ({ label: t.label, href: t.href, active: t.key === active }));
}
