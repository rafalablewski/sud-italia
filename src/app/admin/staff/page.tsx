import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminStaff } from "@/components/admin/AdminStaff";

export default async function AdminStaffPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <AdminStaff />;
}
