import { redirect } from "next/navigation";
import { getCurrentAdminUser } from "@/lib/admin-auth";
import { WelcomeBrief } from "@/admin-v3/WelcomeBrief";

/**
 * Welcome / Morning Brief — the owner's post-login landing (see
 * landingPathForRole). Full-bleed, outside the AdminShell. Open to any
 * signed-in admin; every module is wired to live data and degrades to nothing
 * when its source 403s or is empty (a manager sees fewer panels than an owner).
 */
export default async function WelcomePage() {
  const user = await getCurrentAdminUser();
  if (!user) redirect("/login");
  const first = (user.name || "").trim().split(/\s+/)[0] || "there";
  return <WelcomeBrief name={first} />;
}
