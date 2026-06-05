import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { CrossSellV3 } from "@/components/admin/v3/CrossSellV3";

export default async function AdminV3CrossSellPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <CrossSellV3 />;
}
