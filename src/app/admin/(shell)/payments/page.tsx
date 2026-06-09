import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { PaymentsV3 } from "@/admin-v3/PaymentsV3";

export default async function AdminV3PaymentsPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <PaymentsV3 />;
}
