import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminMenuEngineering } from "@/components/admin/AdminMenuEngineering";

export default async function AdminMenuEngineeringPage() {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }

  return <AdminMenuEngineering />;
}
