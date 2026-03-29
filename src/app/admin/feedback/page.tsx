import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminFeedback } from "@/components/admin/AdminFeedback";

export default async function AdminFeedbackPage() {
  if (!(await isAuthenticated())) {
    redirect("/admin/login");
  }

  return <AdminFeedback />;
}
