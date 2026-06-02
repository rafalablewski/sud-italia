import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AuditLog } from "@/components/admin/AuditLog";

export default async function AdminAuditLogPage() {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }

  return <AuditLog />;
}
