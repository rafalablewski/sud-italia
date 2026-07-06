import type { CoreTab } from "@/core/shell/CoreShell";
import { coreHref } from "@/core/routes";

export type ServiceView = "book" | "tables" | "slots" | "dispatch";

const TABS: { key: ServiceView; label: string; href: string }[] = [
  { key: "book", label: "Book", href: coreHref("/service/book") },
  { key: "tables", label: "Tables", href: coreHref("/service/tables") },
  { key: "slots", label: "Slots", href: coreHref("/service/slots") },
  { key: "dispatch", label: "Dispatch", href: coreHref("/service/dispatch") },
];

export function serviceTabs(active: ServiceView): CoreTab[] {
  return TABS.map((t) => ({ label: t.label, href: t.href, active: t.key === active }));
}
