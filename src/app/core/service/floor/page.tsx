import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { CoreFloor } from "@/core/service/CoreFloor";

export default async function CoreFloorPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <CoreFloor />;
}
