import type { CoreTab } from "@/core/shell/CoreShell";
import { coreHref } from "@/core/routes";

/** The Guest hub's nested views — shared so every guest page lights the same
 *  view tab in the same place on the CoreShell subbar. `book` was promoted to a
 *  top-level Lens (`/core/book`), so it's no longer a Guest sub-tab — the union
 *  keeps it only for back-compatible callers. */
export type GuestView = "inbox" | "guests" | "loyalty" | "concierge" | "book";

const TABS: { key: GuestView; label: string; href: string }[] = [
  { key: "inbox", label: "Inbox", href: coreHref("/guest/inbox") },
  { key: "guests", label: "Guests", href: coreHref("/guest/guests") },
  { key: "loyalty", label: "Loyalty", href: coreHref("/guest/loyalty") },
  { key: "concierge", label: "Concierge", href: coreHref("/guest/concierge") },
];

export function guestTabs(active: GuestView): CoreTab[] {
  return TABS.map((t) => ({ label: t.label, href: t.href, active: t.key === active }));
}
