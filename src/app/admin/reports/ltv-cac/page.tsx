import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminLtvCac } from "@/components/admin/AdminLtvCac";

export default async function AdminLtvCacPage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }
  return <AdminLtvCac />;
}
