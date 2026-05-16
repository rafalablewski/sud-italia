import { redirect } from "next/navigation";
import { getCurrentAdminUser, ROLE_RANK } from "@/lib/admin-auth";
import { AdminLocationsManager } from "@/components/admin/AdminLocationsManager";

export default async function AdminLocationsManagePage() {
  const user = await getCurrentAdminUser();
  if (!user) redirect("/admin/login");
  if (ROLE_RANK[user.role] < ROLE_RANK.owner) {
    redirect("/admin/locations");
  }
  return <AdminLocationsManager />;
}
