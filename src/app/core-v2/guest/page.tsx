import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { SurfacePlaceholder } from "@/core-v2/shell/SurfacePlaceholder";

export default async function CoreV2GuestPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return (
    <SurfacePlaceholder
      active="guest"
      crumb="Guest Engagement"
      title="Guest Engagement — next in the v2 rebuild"
      note="Inbox · Guests · Concierge (plus Loyalty and Book) port onto the separated Core v2 theme after POS and KDS. Today's live hub stays at /core/guest."
    />
  );
}
