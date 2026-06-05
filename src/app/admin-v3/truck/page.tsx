import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { TruckV3 } from "@/components/admin/v3/TruckV3";

export default async function AdminV3TruckPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <TruckV3 />;
}
