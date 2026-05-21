import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminRegulatoryCompliance } from "@/components/admin/AdminRegulatoryCompliance";

export default async function AdminRegulatoryCompliancePage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }
  return <AdminRegulatoryCompliance />;
}
