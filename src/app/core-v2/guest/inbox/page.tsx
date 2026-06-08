import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { CoreV2Inbox } from "@/core-v2/guest/CoreV2Inbox";

export default async function CoreV2GuestInboxPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <CoreV2Inbox />;
}
