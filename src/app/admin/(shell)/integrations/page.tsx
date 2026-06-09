import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { IntegrationsV3 } from "@/admin-v3/IntegrationsV3";

export default async function AdminV3IntegrationsPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <IntegrationsV3 />;
}
