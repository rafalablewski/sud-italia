import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { CustomersV3 } from "@/components/admin/v3/CustomersV3";

export default async function AdminV3CustomersPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <CustomersV3 />;
}
