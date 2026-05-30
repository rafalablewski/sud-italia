import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { getSettings } from "@/lib/store";
import { AdminCohortSimulator } from "@/components/admin/AdminCohortSimulator";

export default async function AdminCohortSimulatorPage() {
  if (!(await isAuthenticated())) redirect("/admin/login");
  const settings = await getSettings();
  if (!settings.cohortSimulationEnabled) redirect("/admin/settings");
  return <AdminCohortSimulator />;
}
