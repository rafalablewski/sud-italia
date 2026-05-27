import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminCrm } from "@/components/admin/AdminCrm";

export default async function AdminCrmPage() {
  if (!(await isAuthenticated())) redirect("/admin/login");
  return <AdminCrm />;
}
