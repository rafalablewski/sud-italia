import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { CoreV2Crm } from "@/core-v2/guest/CoreV2Crm";

export default async function CoreV2GuestsPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <CoreV2Crm />;
}
