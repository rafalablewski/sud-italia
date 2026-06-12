import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { CoreCrm } from "@/core/guest/CoreCrm";

export default async function CoreGuestsPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <CoreCrm />;
}
