import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminSchedule } from "@/components/admin/AdminSchedule";

export default async function AdminSchedulePage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <AdminSchedule />;
}
