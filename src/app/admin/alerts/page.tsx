import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { MobileAlerts } from "@/components/admin/mobile/MobileAlerts";

/**
 * Full-screen mobile alerts view. Direct route — the topbar bell still
 * opens the bottom-sheet `MobileNotifications`, but Home's "View all"
 * link + a long-press on the bell route here for the wider canvas.
 *
 * On desktop the route still works but the wider canvas is essentially
 * the existing NotificationPanel — we render `MobileAlerts` there too;
 * it reflows cleanly because it's already a 1-column list.
 */
export default async function AdminAlertsPage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }
  return <MobileAlerts />;
}
