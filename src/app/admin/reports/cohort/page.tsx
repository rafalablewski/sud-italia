import { redirect } from "next/navigation";
import { getCurrentAdminUser, ROLE_RANK } from "@/lib/admin-auth";
import { AdminCohortReport } from "@/components/admin/AdminCohortReport";

export default async function AdminCohortReportPage() {
  const user = await getCurrentAdminUser();
  if (!user) redirect("/admin/login");
  if (ROLE_RANK[user.role] < ROLE_RANK.manager) {
    redirect("/admin");
  }
  return <AdminCohortReport />;
}
