import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { CoreOrders } from "@/core/orders/CoreOrders";

export default async function CoreOrdersPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <CoreOrders />;
}
