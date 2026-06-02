import { redirect } from "next/navigation";

// WhatsApp is now the Inbox view of the unified Guest Engagement hub.
export default function AdminWhatsAppPage() {
  redirect("/core/guest?view=inbox");
}
