import type { CoreTab } from "@/core/shell/CoreShell";
import { coreHref } from "@/core/routes";

export type ServiceView = "book" | "tables" | "slots" | "dispatch";

// Tables management moved INTO Book (below the timeline) — the standalone tab is
// retired; `/service/tables` redirects to Book. `ServiceView` keeps "tables" so
// the legacy standalone render path still type-checks.
const TABS: { key: ServiceView; label: string; href: string }[] = [
  { key: "book", label: "Book", href: coreHref("/service/book") },
  { key: "slots", label: "Slots", href: coreHref("/service/slots") },
  { key: "dispatch", label: "Dispatch", href: coreHref("/service/dispatch") },
];

export function serviceTabs(active: ServiceView): CoreTab[] {
  return TABS.map((t) => ({ label: t.label, href: t.href, active: t.key === active }));
}
