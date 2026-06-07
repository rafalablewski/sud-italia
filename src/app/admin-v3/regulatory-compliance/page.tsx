import { redirect } from "next/navigation";
import { getCurrentAdminUser } from "@/lib/admin-auth";
import { ROLE_RANK } from "@/lib/admin-roles";
import { RegulatoryV3 } from "@/admin-v3/RegulatoryV3";

export default async function AdminV3RegulatoryPage() {
  const user = await getCurrentAdminUser();
  if (!user) redirect("/login");
  if (ROLE_RANK[user.role] < ROLE_RANK.owner) redirect("/admin-v3");
  return <RegulatoryV3 />;
}
