import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { SurveysV3 } from "@/components/admin/v3/SurveysV3";

export default async function AdminV3SurveysPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <SurveysV3 />;
}
