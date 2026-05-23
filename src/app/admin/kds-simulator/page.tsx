import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { getSettings } from "@/lib/store";
import { AdminKdsSimulator } from "@/components/admin/AdminKdsSimulator";

export default async function AdminKdsSimulatorPage() {
  if (!(await isAuthenticated())) redirect("/admin/login");
  const settings = await getSettings();
  if (!settings.kdsSimulatorEnabled) redirect("/admin/settings");
  return <AdminKdsSimulator />;
}
