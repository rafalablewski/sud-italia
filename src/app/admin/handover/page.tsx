import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminHandover } from "@/components/admin/AdminHandover";

export default async function AdminHandoverPage() {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }
  return <AdminHandover />;
}
