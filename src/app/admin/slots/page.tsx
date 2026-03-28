import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminSlots } from "@/components/admin/AdminSlots";

export const dynamic = "force-dynamic";

export default async function AdminSlotsPage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }

  return <AdminSlots />;
}
