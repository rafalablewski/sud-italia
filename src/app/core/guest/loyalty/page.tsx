import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { CoreLoyalty } from "@/core/guest/CoreLoyalty";

export default async function CoreLoyaltyPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <CoreLoyalty />;
}
