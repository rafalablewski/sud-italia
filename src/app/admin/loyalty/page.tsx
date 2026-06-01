import { redirect } from "next/navigation";

// Loyalty is now the Loyalty view of the unified Guest Engagement hub.
export default function AdminLoyaltyPage() {
  redirect("/admin/guest?view=loyalty");
}
