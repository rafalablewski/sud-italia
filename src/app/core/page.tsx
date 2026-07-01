import { redirect } from "next/navigation";
import { coreHref } from "@/core/routes";
import { getCurrentRole } from "@/lib/admin-auth";

// Role-shaped default lens: kitchen roles land on the Pass (KDS) — their whole
// job is the wall — while everyone else (server / manager / owner) lands on the
// Floor home base, where tapping a table blooms its actions. Finer front-of-
// house titles (bartender / host) collapse to the "staff" access tier, so they
// can't be split further from the session role alone.
export default async function CoreIndex() {
  const role = await getCurrentRole();
  redirect(coreHref(role === "kitchen" ? "/kds" : "/service/floor"));
}
