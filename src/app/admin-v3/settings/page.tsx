import { redirect } from "next/navigation";
import { getCurrentAdminUser } from "@/lib/admin-auth";
import { ROLE_RANK } from "@/lib/admin-roles";
import { SettingsV3 } from "@/admin-v3/SettingsV3";

export default async function AdminV3SettingsPage() {
  const user = await getCurrentAdminUser();
  if (!user) redirect("/login");
  if (ROLE_RANK[user.role] < ROLE_RANK.owner) redirect("/admin-v3");
  return <SettingsV3 />;
}
