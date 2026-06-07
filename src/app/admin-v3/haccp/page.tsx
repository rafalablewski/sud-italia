import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { HaccpV3 } from "@/admin-v3/HaccpV3";

export default async function AdminV3HaccpPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <HaccpV3 />;
}
