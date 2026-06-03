import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminSurveys } from "@/components/admin/AdminSurveys";

export default async function AdminSurveysPage() {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }

  return <AdminSurveys />;
}
