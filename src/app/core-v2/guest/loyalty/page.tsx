import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { ScaffoldSurface } from "@/core-v2/shell/ScaffoldSurface";
import { guestTabs } from "@/core-v2/guest/guestTabs";

export default async function CoreV2LoyaltyPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return (
    <ScaffoldSurface
      eyebrow="Guest Engagement"
      tabs={guestTabs("loyalty")}
      icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden><path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10Z" /></svg>}
      title="Loyalty — phone-enrolled members"
      blurb="Members (Bronze → Platinum), points liability, family wallets, redemptions, and the win-back queue — same ledger across POS / web / WhatsApp."
      step="Wiring next (Step 5c)"
    />
  );
}
