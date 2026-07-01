import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { CoreBook } from "@/core/guest/CoreBook";

/**
 * The Book lens (`/core/book`) — the top-level Service OS lens for slots &
 * reservations, promoted out of the Guest sub-nav. Renders the booking timeline
 * standalone (its own "Book" eyebrow, no Guest subbar).
 */
export default async function CoreBookLensPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <CoreBook standalone />;
}
