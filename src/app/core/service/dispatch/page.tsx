import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { CoreDispatch } from "@/core/service/CoreDispatch";

export default async function CoreDispatchPage() {
  if (!(await isAuthenticated())) redirect("/login");
  return <CoreDispatch />;
}
