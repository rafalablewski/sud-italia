import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { LanguagesV3 } from "@/admin-v3/LanguagesV3";

export default async function AdminV3LanguagesPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <LanguagesV3 />;
}
