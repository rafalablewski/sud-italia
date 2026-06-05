import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { DashboardV3 } from "@/components/admin/v3/DashboardV3";

// v3 preview dashboard. Gated like the rest of admin — any authenticated
// operator can open the preview (unlike the owner-only /admin HQ root) so the
// rebuild can be reviewed across roles. Server endpoints still enforce their
// own boundaries on every /api/admin/* call.
export default async function AdminV3Page() {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }
  return <DashboardV3 />;
}
