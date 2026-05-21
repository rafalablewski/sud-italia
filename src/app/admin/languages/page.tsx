import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminLanguages } from "@/components/admin/AdminLanguages";

export default async function AdminLanguagesPage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }
  return <AdminLanguages />;
}
