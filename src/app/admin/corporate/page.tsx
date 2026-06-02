import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminCorporate } from "@/components/admin/AdminCorporate";

export default async function AdminCorporatePage() {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }
  return <AdminCorporate />;
}
