import { redirect } from "next/navigation";

// The Guest hub lands on the Inbox.
export default function CoreV2GuestIndex() {
  redirect("/core-v2/guest/inbox");
}
