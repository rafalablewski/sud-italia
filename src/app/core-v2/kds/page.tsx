import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { CoreV2Kds } from "@/core-v2/kds/CoreV2Kds";

export default async function CoreV2KdsPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <CoreV2Kds />;
}
