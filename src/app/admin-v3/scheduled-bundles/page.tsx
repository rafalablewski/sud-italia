import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { ScheduledBundlesV3 } from "@/admin-v3/ScheduledBundlesV3";

export default async function AdminV3ScheduledBundlesPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <ScheduledBundlesV3 />;
}
