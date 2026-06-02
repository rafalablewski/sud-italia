import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminLocations } from "@/components/admin/AdminLocations";

export default async function AdminLocationsPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <AdminLocations />;
}
