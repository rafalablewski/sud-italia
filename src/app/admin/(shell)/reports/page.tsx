import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { ReportsV3 } from "@/admin-v3/ReportsV3";

export default async function AdminV3ReportsPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <ReportsV3 />;
}
