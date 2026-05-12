import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminPurchaseOrders } from "@/components/admin/AdminPurchaseOrders";

export default async function AdminPurchaseOrdersPage() {
  if (!(await isAuthenticated())) redirect("/admin/login");
  return <AdminPurchaseOrders />;
}
