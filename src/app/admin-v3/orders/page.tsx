import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { OrdersV3 } from "@/components/admin/v3/OrdersV3";

// Orders is a staff+ operational surface (unlike the owner-only HQ dashboard).
// Any authenticated operator can open it; the order endpoints enforce their own
// per-role + per-location boundaries.
export default async function AdminV3OrdersPage() {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }
  return <OrdersV3 />;
}
