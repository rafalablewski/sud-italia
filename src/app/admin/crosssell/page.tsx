import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminCrossSell } from "@/components/admin/AdminCrossSell";

export default async function AdminCrossSellPage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }

  return <AdminCrossSell />;
}
