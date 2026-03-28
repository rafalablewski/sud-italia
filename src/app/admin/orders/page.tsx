import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminOrders } from "@/components/admin/AdminOrders";

export default async function AdminOrdersPage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }

  return <AdminOrders />;
}
