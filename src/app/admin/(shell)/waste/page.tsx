import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { WasteV3 } from "@/admin-v3/WasteV3";

export default async function AdminV3WastePage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <WasteV3 />;
}
