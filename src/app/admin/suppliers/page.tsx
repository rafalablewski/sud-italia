import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminSuppliers } from "@/components/admin/AdminSuppliers";

export default async function AdminSuppliersPage() {
  if (!(await isAuthenticated())) redirect("/admin/login");
  return <AdminSuppliers />;
}
