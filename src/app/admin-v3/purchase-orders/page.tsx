import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { PurchaseOrdersV3 } from "@/components/admin/v3/PurchaseOrdersV3";

export default async function AdminV3PurchaseOrdersPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <PurchaseOrdersV3 />;
}
