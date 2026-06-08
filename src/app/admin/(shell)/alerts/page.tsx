import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AlertsV3 } from "@/admin-v3/AlertsV3";

export default async function AdminV3AlertsPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <AlertsV3 />;
}
