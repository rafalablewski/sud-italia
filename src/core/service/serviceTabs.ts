import type { CoreTab } from "@/core/shell/CoreShell";
import { coreHref } from "@/core/routes";

export type ServiceView = "floor" | "slots" | "dispatch";

const TABS: { key: ServiceView; label: string; href: string }[] = [
  { key: "floor", label: "Floor", href: coreHref("/service/floor") },
  { key: "slots", label: "Slots", href: coreHref("/service/slots") },
  { key: "dispatch", label: "Dispatch", href: coreHref("/service/dispatch") },
];

export function serviceTabs(active: ServiceView): CoreTab[] {
  return TABS.map((t) => ({ label: t.label, href: t.href, active: t.key === active }));
}
