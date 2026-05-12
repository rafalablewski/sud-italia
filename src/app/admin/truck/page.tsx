import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminTruck } from "@/components/admin/AdminTruck";

export default async function AdminTruckPage() {
  if (!(await isAuthenticated())) redirect("/admin/login");
  return <AdminTruck />;
}
