import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { StaffV3 } from "@/components/admin/v3/StaffV3";

export default async function AdminV3StaffPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <StaffV3 />;
}
