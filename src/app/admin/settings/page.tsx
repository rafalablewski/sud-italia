import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminSettings } from "@/components/admin/AdminSettings";

export default async function AdminSettingsPage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }

  return <AdminSettings />;
}
