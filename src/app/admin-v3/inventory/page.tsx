import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { InventoryV3 } from "@/components/admin/v3/InventoryV3";

// Stock is a staff+ operational surface (low-stock visibility during service).
// The stock + movement endpoints enforce per-location access.
export default async function AdminV3InventoryPage() {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }
  return <InventoryV3 />;
}
