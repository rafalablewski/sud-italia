import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminLoyalty } from "@/components/admin/AdminLoyalty";

export default async function AdminLoyaltyPage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }

  return <AdminLoyalty />;
}
