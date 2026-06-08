import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { ScaffoldSurface } from "@/core-v2/shell/ScaffoldSurface";
import { guestTabs } from "@/core-v2/guest/guestTabs";

export default async function CoreV2ConciergePage() {
  if (!(await isAuthenticated())) redirect("/login");
  return (
    <ScaffoldSurface
      eyebrow="Guest Engagement"
      tabs={guestTabs("concierge")}
      icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M9 9h6M9 13h4" /></svg>}
      title="Concierge — the AI capability layer"
      blurb="The MCP capability inspector (get_menu · check_availability · get_allergens · place_order · …) with live exposure toggles and the EU-14 allergen matrix."
      step="Wiring next (Step 5d)"
    />
  );
}
