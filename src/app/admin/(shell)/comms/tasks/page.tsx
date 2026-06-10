import { redirect } from "next/navigation";
import { getCurrentAdminUser } from "@/lib/admin-auth";
import { userHasPermission } from "@/lib/permissions";
import { landingPathForRole } from "@/lib/staff-roles";
import { CommsV3 } from "@/admin-v3/CommsV3";

// The Tasks management board. Owner-default (comms.view), but grantable to a
// manager via the Permission Matrix. Server-gates so a direct URL can't load it
// without the permission; the API enforces every write too.
export default async function AdminCommsTasksPage() {
  const user = await getCurrentAdminUser();
  if (!user) redirect("/login");
  if (!userHasPermission(user, "comms.view")) redirect(landingPathForRole(user.role));
  return <CommsV3 view="tasks" />;
}
