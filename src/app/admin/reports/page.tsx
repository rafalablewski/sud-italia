import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminReports } from "@/components/admin/AdminReports";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }

  return <AdminReports />;
}
