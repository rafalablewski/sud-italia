import { redirect } from "next/navigation";
import { isAuthenticated, getCurrentRole } from "@/lib/admin-auth";
import { landingPathForRole } from "@/lib/staff-roles";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

// The `/admin` HQ dashboard is the owner's company-wide cockpit and is
// reserved for the owner. Everyone else is bounced to their own home —
// manager → /manager, franchisee → /franchisee, staff → POS, kitchen → KDS
// (landingPathForRole is the single source of truth). This is the server-side
// half of the wall; the operational pages under /admin/* stay reachable for a
// manager's granted permissions — only this HQ root is gated.
export default async function AdminPage() {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }

  const role = await getCurrentRole();
  if (role && role !== "owner") {
    redirect(landingPathForRole(role));
  }

  return <AdminDashboard />;
}
