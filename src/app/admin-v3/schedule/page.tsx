import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { ScheduleV3 } from "@/components/admin/v3/ScheduleV3";

export default async function AdminV3SchedulePage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <ScheduleV3 />;
}
