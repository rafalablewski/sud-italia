import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminPermissions } from "@/components/admin/AdminPermissions";

export default async function AdminPermissionsPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <AdminPermissions />;
}
