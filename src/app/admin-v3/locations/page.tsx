import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { MultiLocationV3 } from "@/components/admin/v3/MultiLocationV3";

export default async function AdminV3MultiLocationPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <MultiLocationV3 />;
}
