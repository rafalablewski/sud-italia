import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminCurrency } from "@/components/admin/AdminCurrency";

export default async function AdminCurrencyPage() {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }
  return <AdminCurrency />;
}
