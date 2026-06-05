import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { CurrencyV3 } from "@/components/admin/v3/CurrencyV3";

export default async function AdminV3CurrencyPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <CurrencyV3 />;
}
