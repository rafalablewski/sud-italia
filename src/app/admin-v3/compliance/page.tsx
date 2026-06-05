import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { ComplianceV3 } from "@/components/admin/v3/ComplianceV3";

export default async function AdminV3CompliancePage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <ComplianceV3 />;
}
