import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminExpansion } from "@/components/admin/AdminExpansion";

export default async function AdminExpansionPage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }

  return <AdminExpansion />;
}
