import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { GrowthV3 } from "@/admin-v3/GrowthV3";

export default async function AdminV3GrowthPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <GrowthV3 />;
}
