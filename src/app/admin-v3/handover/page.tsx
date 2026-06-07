import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { HandoverV3 } from "@/admin-v3/HandoverV3";

export default async function AdminV3HandoverPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <HandoverV3 />;
}
