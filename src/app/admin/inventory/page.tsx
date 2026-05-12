import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminInventory } from "@/components/admin/AdminInventory";

export default async function AdminInventoryPage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }
  return <AdminInventory />;
}
