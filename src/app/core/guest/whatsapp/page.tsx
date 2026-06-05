import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminWhatsApp } from "@/components/admin/AdminWhatsApp";

/**
 * Guest Engagement · Inbox — the live WhatsApp ordering channel (conversations
 * + order context + funnel). One view of the unified Guest hub; see
 * docs/design-system/core/modules/guest.md.
 */
export default async function GuestInboxPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <AdminWhatsApp />;
}
