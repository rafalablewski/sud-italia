import { redirect } from "next/navigation";
import { isAuthenticated, getCurrentRole } from "@/lib/admin-auth";
import { landingPathForRole } from "@/lib/staff-roles";
import { DashboardV3 } from "@/components/admin/v3/DashboardV3";

// The Operator Terminal is the owner's company-wide cockpit — same gate as the
// v2 `/admin` HQ root (owner-only; everyone else lands on their own home). This
// is also what lets the dashboard read the owner-scoped fleet + labour-forecast
// endpoints. Server endpoints still enforce their own boundaries.
export default async function AdminV3Page() {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }
  const role = await getCurrentRole();
  if (role && role !== "owner") {
    redirect(landingPathForRole(role));
  }
  return <DashboardV3 />;
}
