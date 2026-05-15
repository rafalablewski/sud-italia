import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminScheduledBundles } from "@/components/admin/AdminScheduledBundles";

export default async function AdminScheduledBundlesPage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }
  return <AdminScheduledBundles />;
}
