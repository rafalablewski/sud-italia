import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminMenu } from "@/components/admin/AdminMenu";

export default async function AdminMenuPage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }

  return <AdminMenu />;
}
