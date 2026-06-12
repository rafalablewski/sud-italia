import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { CoreInbox } from "@/core/guest/CoreInbox";

export default async function CoreGuestInboxPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <CoreInbox />;
}
