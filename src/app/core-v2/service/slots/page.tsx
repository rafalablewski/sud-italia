import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { CoreV2Slots } from "@/core-v2/service/CoreV2Slots";

export default async function CoreV2SlotsPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <CoreV2Slots />;
}
