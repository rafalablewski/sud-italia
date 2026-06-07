import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { ExpansionV3 } from "@/admin-v3/ExpansionV3";

export default async function AdminV3ExpansionPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <ExpansionV3 />;
}
