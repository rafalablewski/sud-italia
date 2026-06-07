import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AuditLogV3 } from "@/admin-v3/AuditLogV3";

export default async function AdminV3AuditLogPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <AuditLogV3 />;
}
