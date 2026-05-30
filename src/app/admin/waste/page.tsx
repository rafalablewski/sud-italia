import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminWaste } from "@/components/admin/AdminWaste";

export default async function AdminWastePage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }
  return <AdminWaste />;
}
