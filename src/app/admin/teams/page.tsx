import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminTeams } from "@/components/admin/AdminTeams";

export default async function AdminTeamsPage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }
  return <AdminTeams />;
}
