import type { CoreV2Tab } from "@/core-v2/shell/CoreV2Shell";

export type ServiceView = "floor" | "slots";

const TABS: { key: ServiceView; label: string; href: string }[] = [
  { key: "floor", label: "Floor", href: "/core-v2/service/floor" },
  { key: "slots", label: "Slots", href: "/core-v2/service/slots" },
];

export function serviceTabs(active: ServiceView): CoreV2Tab[] {
  return TABS.map((t) => ({ label: t.label, href: t.href, active: t.key === active }));
}
