import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { WelcomeV3 } from "@/admin-v3/WelcomeV3";

/**
 * Welcome — the friendly landing that sits above Dashboard in the Overview
 * nav. Greets the operator and surfaces the AI boardroom's latest daily brief
 * (transcript + decisions), with a one-tap "run today's brief" and quick links
 * into the rest of the admin. Open to any signed-in admin; the brief itself is
 * served by the manager-gated boardroom API, which the page degrades around.
 */
export default async function AdminV3WelcomePage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <WelcomeV3 />;
}
