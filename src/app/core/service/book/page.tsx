import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { CoreBook } from "@/core/service/CoreBook";

/**
 * The Book view (`/core/service/book`) — slots & reservations, a Service view
 * alongside Floor / Slots / Dispatch (see `serviceTabs`). Renders the booking
 * timeline with the Service tab bar.
 */
export default async function CoreServiceBookPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <CoreBook />;
}
