import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { CoreV2Floor } from "@/core-v2/service/CoreV2Floor";

export default async function CoreV2FloorPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <CoreV2Floor />;
}
