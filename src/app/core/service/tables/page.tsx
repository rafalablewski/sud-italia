import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { CoreTables } from "@/core/service/CoreTables";

export default async function CoreTablesPage() {
  if (!(await isAuthenticated())) redirect("/login");
  // Tables is a pure management surface — zones, tables, seats — reading and
  // writing the shared table catalogue directly (/api/admin/floor/tables). It
  // no longer mounts the embedded till, so it needs no server-resolved menu or
  // cross-sell config; seating and checks live in Book / POS.
  return <CoreTables />;
}
