import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { FeedbackV3 } from "@/components/admin/v3/FeedbackV3";

export default async function AdminV3FeedbackPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <FeedbackV3 />;
}
