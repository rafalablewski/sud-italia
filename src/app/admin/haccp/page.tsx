import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminHaccp } from "@/components/admin/AdminHaccp";

export default async function AdminHaccpPage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }
  return <AdminHaccp />;
}
