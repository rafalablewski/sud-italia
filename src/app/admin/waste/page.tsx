import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminWaste } from "@/components/admin/AdminWaste";

export default async function AdminWastePage() {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }
  return <AdminWaste />;
}
