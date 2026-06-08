import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { ScaffoldSurface } from "@/core-v2/shell/ScaffoldSurface";
import { guestTabs } from "@/core-v2/guest/guestTabs";

export default async function CoreV2BookPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return (
    <ScaffoldSurface
      eyebrow="Guest Engagement"
      tabs={guestTabs("book")}
      icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></svg>}
      title="Book — slot + table in one move"
      blurb="Pick a dine-in slot, assign a table (with an AI recommend that fits party to seats), capture the guest, and confirm — conflicts & over-capacity flagged."
      step="Wiring next (Step 5e)"
    />
  );
}
