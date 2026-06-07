import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { ServiceFrame } from "@/core/service/ServiceFrame";

/**
 * Service · Floor — the live room (tables + digital twin). One view of the
 * merged Service surface; see docs/design-system/core/modules/service.md.
 */
export default async function ServiceFloorPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <ServiceFrame view="floor" />;
}
