import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminUpsell } from "@/components/admin/AdminUpsell";

export default async function AdminUpsellPage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }

  return <AdminUpsell />;
}
