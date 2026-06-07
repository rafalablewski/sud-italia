import { redirect } from "next/navigation";
import { getCurrentAdminUser } from "@/lib/admin-auth";
import { ROLE_RANK } from "@/lib/admin-roles";
import { PermissionsV3 } from "@/admin-v3/PermissionsV3";

export default async function AdminV3PermissionsPage() {
  const user = await getCurrentAdminUser();
  if (!user) redirect("/login");
  if (ROLE_RANK[user.role] < ROLE_RANK.owner) redirect("/admin");
  return <PermissionsV3 />;
}
