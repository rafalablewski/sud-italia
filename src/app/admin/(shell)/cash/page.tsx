import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { CashV3 } from "@/admin-v3/CashV3";

export default async function AdminV3CashPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <CashV3 />;
}
