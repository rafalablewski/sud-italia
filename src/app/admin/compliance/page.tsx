import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminCompliance } from "@/components/admin/AdminCompliance";

export default async function AdminCompliancePage() {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }
  return <AdminCompliance />;
}
