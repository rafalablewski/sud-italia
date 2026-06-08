import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { ScaffoldSurface } from "@/core-v2/shell/ScaffoldSurface";

export default async function CoreV2KdsPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return (
    <ScaffoldSurface
      eyebrow="Kitchen Display · Kraków line"
      bleed
      tabs={[{ label: "Fleet" }, { label: "Floor", active: true }, { label: "Chef" }]}
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 9h10M7 13h6" />
        </svg>
      }
      title="KDS — the kitchen wall"
      blurb="Fleet · Floor (New → Firing → Ready·Expo lanes, SLA tiers, cook-meters, bump) · Chef. Always-dark wall with a fullscreen kiosk mode."
      step="Wiring in Step 4"
    />
  );
}
