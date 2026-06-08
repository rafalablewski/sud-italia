import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { SurfacePlaceholder } from "@/core-v2/shell/SurfacePlaceholder";

export default async function CoreV2KdsPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return (
    <SurfacePlaceholder
      active="kds"
      crumb="KDS"
      title="KDS — next in the v2 rebuild"
      note="The Fleet command wall, Floor board and Chef line port onto the same separated Core v2 theme right after POS. Today's live KDS stays at /core/kds."
    />
  );
}
