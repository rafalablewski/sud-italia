import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { CoreKds } from "@/core/kds/CoreKds";

export default async function CoreKdsPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <CoreKds />;
}
