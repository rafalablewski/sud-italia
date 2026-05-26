import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminFloor } from "@/components/admin/AdminFloor";

export default async function AdminFloorPage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }
  return <AdminFloor />;
}
