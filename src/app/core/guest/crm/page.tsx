import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminCrm } from "@/components/admin/AdminCrm";

/**
 * Guest Engagement · Guests — the CRM customer book. One view of the unified
 * Guest hub; see docs/design-system/core/modules/guest.md.
 */
export default async function GuestCrmPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <AdminCrm />;
}
