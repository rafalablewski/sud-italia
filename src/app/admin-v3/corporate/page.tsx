import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { CorporateV3 } from "@/components/admin/v3/CorporateV3";

export default async function AdminV3CorporatePage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <CorporateV3 />;
}
