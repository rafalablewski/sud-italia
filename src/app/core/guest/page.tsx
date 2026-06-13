import { redirect } from "next/navigation";
import { coreHref } from "@/core/routes";

// The Guest hub lands on the Inbox.
export default function CoreGuestIndex() {
  redirect(coreHref("/guest/inbox"));
}
