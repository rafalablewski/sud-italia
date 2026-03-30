import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminAI } from "@/components/admin/AdminAI";

export default async function AdminAIPage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }

  return <AdminAI />;
}
