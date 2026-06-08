import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { SurfacePlaceholder } from "@/core-v2/shell/SurfacePlaceholder";

export default async function CoreV2ServicePage() {
  if (!(await isAuthenticated())) redirect("/login");
  return (
    <SurfacePlaceholder
      active="floor"
      crumb="Service"
      title="Service — next in the v2 rebuild"
      note="Floor (live room + twin) and Slots (capacity + demand) port onto the separated Core v2 theme. Today's live Service surface stays at /core/service."
    />
  );
}
