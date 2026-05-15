import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminWhatsApp } from "@/components/admin/AdminWhatsApp";

export default async function AdminWhatsAppPage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }
  return <AdminWhatsApp />;
}
