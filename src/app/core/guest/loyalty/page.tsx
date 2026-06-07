import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { AdminLoyalty } from "@/core/guest/AdminLoyalty";

/**
 * Guest Engagement · Loyalty — member roster + family wallets + redemption log.
 * One view of the unified Guest hub; see
 * docs/design-system/core/modules/guest.md.
 */
export default async function GuestLoyaltyPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <AdminLoyalty />;
}
