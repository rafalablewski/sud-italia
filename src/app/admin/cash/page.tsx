import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminCash } from "@/components/admin/AdminCash";

export default async function AdminCashPage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }
  return <AdminCash />;
}
