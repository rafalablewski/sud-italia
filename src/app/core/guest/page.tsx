import { redirect } from "next/navigation";

// The Guest Engagement hub is split into nested routes (whatsapp / crm /
// loyalty / concierge / book). The bare hub lands on the Inbox.
export default function GuestHubIndex() {
  redirect("/core/guest/whatsapp");
}
