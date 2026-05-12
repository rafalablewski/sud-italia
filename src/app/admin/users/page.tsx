import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminUsers } from "@/components/admin/AdminUsers";

export default async function AdminUsersPage() {
  if (!(await isAuthenticated())) redirect("/admin/login");
  return <AdminUsers />;
}
