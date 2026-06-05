import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { MenuEngineeringV3 } from "@/components/admin/v3/MenuEngineeringV3";

export default async function AdminV3MenuEngineeringPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <MenuEngineeringV3 />;
}
