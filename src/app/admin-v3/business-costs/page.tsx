import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { BusinessCostsV3 } from "@/admin-v3/BusinessCostsV3";

export default async function AdminV3BusinessCostsPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <BusinessCostsV3 />;
}
