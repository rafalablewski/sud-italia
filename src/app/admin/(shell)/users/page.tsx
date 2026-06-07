import { redirect } from "next/navigation";
import { getCurrentAdminUser } from "@/lib/admin-auth";
import { ROLE_RANK } from "@/lib/admin-roles";
import { UsersV3 } from "@/admin-v3/UsersV3";

export default async function AdminV3UsersPage() {
  const user = await getCurrentAdminUser();
  if (!user) redirect("/login");
  if (ROLE_RANK[user.role] < ROLE_RANK.owner) redirect("/admin");
  return <UsersV3 />;
}
