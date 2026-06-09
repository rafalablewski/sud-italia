import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { getActiveLocations } from "@/data/locations";
import { QrOrderingV3 } from "@/admin-v3/QrOrderingV3";

export default async function AdminV3QrOrderingPage() {
  if (!(await isAuthenticated())) redirect("/login");
  const locations = getActiveLocations().map((l) => ({ slug: l.slug, name: l.name, city: l.city }));
  return <QrOrderingV3 locations={locations} />;
}
