import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { ServiceFrame } from "@/components/admin/service/ServiceFrame";

/**
 * Service · Slots — capacity + demand. One view of the merged Service surface;
 * see docs/design-system/core/modules/service.md.
 */
export default async function ServiceSlotsPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <ServiceFrame view="slots" />;
}
