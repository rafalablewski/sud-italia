import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { ManageLocationsV3 } from "@/admin-v3/ManageLocationsV3";

export default async function AdminV3ManageLocationsPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <ManageLocationsV3 />;
}
