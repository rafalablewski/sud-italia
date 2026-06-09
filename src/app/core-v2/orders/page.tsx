import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { CoreV2Orders } from "@/core-v2/orders/CoreV2Orders";

export default async function CoreV2OrdersPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <CoreV2Orders />;
}
