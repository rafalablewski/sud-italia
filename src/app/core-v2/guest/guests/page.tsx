import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { ScaffoldSurface } from "@/core-v2/shell/ScaffoldSurface";
import { guestTabs } from "@/core-v2/guest/guestTabs";

export default async function CoreV2GuestsPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return (
    <ScaffoldSurface
      eyebrow="Guest Engagement"
      tabs={guestTabs("guests")}
      icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0M16 4a3 3 0 0 1 0 6M21 20a6 6 0 0 0-5-5.9" /></svg>}
      title="Guests — the customer book"
      blurb="Every guest across POS, web, WhatsApp & delivery in one roster: segments, channels, recency, health + RFM, and a profile drawer with LTV, points and timeline."
      step="Wiring next (Step 5b)"
    />
  );
}
