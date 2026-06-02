import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { getSettings } from "@/lib/store";
import { AdminSimulation } from "@/components/admin/AdminSimulation";

export default async function AdminSimulationPage() {
  if (!(await isAuthenticated())) redirect("/login");
  const settings = await getSettings();
  if (!settings.simulationEnabled) redirect("/admin/settings");
  return <AdminSimulation />;
}
