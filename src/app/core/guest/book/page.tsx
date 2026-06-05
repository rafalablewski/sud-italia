import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { GuestBook } from "@/components/admin/guest/GuestBook";

/**
 * Guest Engagement · Book — the unified slot+table booking console. One view of
 * the unified Guest hub (moved here from Service); see
 * docs/design-system/core/modules/guest.md.
 */
export default async function GuestBookPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <GuestBook />;
}
