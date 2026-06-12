import { redirect } from "next/navigation";
import { getCurrentAdminUser } from "@/lib/admin-auth";
import { isLocationOpenNow } from "@/data/locations";
import { getActiveLocationsAsync } from "@/lib/locations-store";
import { WelcomeBrief } from "@/admin-v3/WelcomeBrief";

/**
 * Welcome / Morning Brief — the owner's post-login landing (see
 * landingPathForRole). Full-bleed, outside the AdminShell. Open to any
 * signed-in admin; every module is wired to live data and degrades to nothing
 * when its source 403s or is empty (a manager sees fewer panels than an owner).
 * Location count + open status are derived from the real active-locations
 * catalogue here on the server and passed down — never hardcoded.
 */
export default async function WelcomePage() {
  const user = await getCurrentAdminUser();
  if (!user) redirect("/login");
  const first = (user.name || "").trim().split(/\s+/)[0] || "there";
  // Live DB-backed list (falls back to the seed when the table is empty) so the
  // open-now count reflects edits made in /admin/locations/manage.
  const locations = await getActiveLocationsAsync();
  const openNow = locations.filter((l) => isLocationOpenNow(l)).length;
  return <WelcomeBrief name={first} locationCount={locations.length} openNow={openNow} />;
}
