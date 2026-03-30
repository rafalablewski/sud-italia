import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminGrowth } from "@/components/admin/AdminGrowth";

export default async function AdminGrowthPage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }

  return <AdminGrowth />;
}
