import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { SuppliersV3 } from "@/admin-v3/SuppliersV3";

export default async function AdminV3SuppliersPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <SuppliersV3 />;
}
