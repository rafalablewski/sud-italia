import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { ScaffoldSurface } from "@/core-v2/shell/ScaffoldSurface";

export default async function CoreV2GuestPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return (
    <ScaffoldSurface
      eyebrow="Guest Engagement"
      tabs={[
        { label: "Inbox", active: true },
        { label: "Guests" },
        { label: "Loyalty" },
        { label: "Concierge" },
        { label: "Book" },
      ]}
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
        </svg>
      }
      title="Guest — the engagement hub"
      blurb="WhatsApp Inbox (3-pane + live order context + next-best-action), the customer book (CRM), Loyalty wallets, the AI Concierge, and Book — one roster across every channel."
      step="Wiring in Step 5"
    />
  );
}
