import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { getSettings } from "@/lib/store";
import { AdminMenuEngineeringSimulator } from "@/components/admin/AdminMenuEngineeringSimulator";

export default async function AdminMenuEngineeringSimulatorPage() {
  if (!(await isAuthenticated())) redirect("/admin/login");
  const settings = await getSettings();
  if (!settings.menuEngineeringSimulationEnabled) redirect("/admin/settings");
  return <AdminMenuEngineeringSimulator />;
}
