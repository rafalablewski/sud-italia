import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { CoreSlots } from "@/core/service/CoreSlots";

export default async function CoreSlotsPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <CoreSlots />;
}
