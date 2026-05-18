import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminBusinessCosts } from "@/components/admin/AdminBusinessCosts";

export default async function AdminBusinessCostsPage() {
  if (!(await isAuthenticated())) redirect("/admin/login");
  return <AdminBusinessCosts />;
}
