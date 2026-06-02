import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminKDS } from "@/components/admin/AdminKDS";

export default async function AdminKDSPage() {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }
  return <AdminKDS />;
}
