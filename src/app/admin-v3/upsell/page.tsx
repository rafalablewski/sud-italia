import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { UpsellV3 } from "@/components/admin/v3/UpsellV3";

export default async function AdminV3UpsellPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <UpsellV3 />;
}
