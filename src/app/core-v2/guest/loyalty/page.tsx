import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { CoreV2Loyalty } from "@/core-v2/guest/CoreV2Loyalty";

export default async function CoreV2LoyaltyPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <CoreV2Loyalty />;
}
