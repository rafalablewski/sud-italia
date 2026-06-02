import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminCustomers } from "@/components/admin/AdminCustomers";

export default async function AdminCustomersPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <AdminCustomers />;
}
