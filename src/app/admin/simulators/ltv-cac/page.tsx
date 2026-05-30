import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { getSettings } from "@/lib/store";
import { AdminLtvCacSimulator } from "@/components/admin/AdminLtvCacSimulator";

export default async function AdminLtvCacSimulatorPage() {
  if (!(await isAuthenticated())) redirect("/admin/login");
  const settings = await getSettings();
  if (!settings.ltvCacSimulationEnabled) redirect("/admin/settings");
  return <AdminLtvCacSimulator />;
}
