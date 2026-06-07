import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { InsightsV3 } from "@/admin-v3/InsightsV3";

export default async function AdminV3InsightsPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <InsightsV3 />;
}
